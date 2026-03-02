const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const DbStore = require('../../shared/database/dbStore');
const logger = require('../../shared/utils/logger');
const { applyFieldRules } = require('../../shared/utils/fieldTransformer');
const pgQueue = require('../../shared/queue/pgQueue');

const fieldMappingStore = new DbStore('field_mappings');
const transactionStore = new DbStore('transaction_logs');
const workOrderStore = new DbStore('work_orders');

// Tekrar işleme alınmaması gereken durumlar
const ACTIVE_STATUSES = ['RECEIVED', 'SENT_TO_WMS', 'IN_PROGRESS', 'PARTIALLY_DONE', 'COMPLETED', 'PGI_POSTED', 'GR_POSTED'];

/**
 * Dinamik Inbound Endpoint
 * SAP bu endpoint'e POST yaparak kokpite veri gönderir.
 * URL pattern: /api/inbound/:processSlug/:companySlug
 *
 * Pipeline:
 * 1. Gelen URL'i field_mappings'deki source_api_endpoint ile eşleştir
 * 2. Eşleşen mapping'in field_rules'ını uygula (SAP → 3PL dönüşümü)
 * 3. INBOUND transaction kaydı oluştur (correlation_id ile)
 * 4. CREATE_WORK_ORDER işini kuyruğa ekle (asenkron)
 *    → Worker: iş emri oluşturur, api_endpoint varsa DISPATCH_TO_3PL kuyruğa ekler
 * 5. correlation_id ile hızlı yanıt dön
 */
router.all('/*', async (req, res) => {
  try {
  const incomingPath = '/api/inbound' + req.path;
  const mappings = await fieldMappingStore.readAll();

  // source_api_endpoint ile eşleştir
  const mapping = mappings.find(fm =>
    fm.source_api_endpoint === incomingPath && fm.is_active
  );

  if (!mapping) {
    logger.warn('Inbound: no mapping found for path', { path: incomingPath });
    return res.status(404).json({
      error: 'No active field mapping found for this endpoint',
      path: incomingPath,
      available: mappings
        .filter(fm => fm.source_api_endpoint && fm.is_active)
        .map(fm => fm.source_api_endpoint)
    });
  }

  const inputPayload = req.body || {};
  const startTime = Date.now();
  const receivedAt = new Date().toISOString();
  const isWorkOrder = mapping.category !== 'MASTER_DATA';

  // ── Duplike kontrolü: yalnızca WORK_ORDER kategorisi için ──
  const deliveryNo = inputPayload.HEADER
    ? inputPayload.HEADER.VBELN
    : (inputPayload.VBELN || null);

  if (isWorkOrder && deliveryNo) {
    const existingOrders = await workOrderStore.readAll();
    const duplicate = existingOrders.find(wo =>
      wo.sap_delivery_no === deliveryNo && ACTIVE_STATUSES.includes(wo.status)
    );

    if (duplicate) {
      logger.warn('Inbound: duplicate delivery rejected', {
        delivery_no: deliveryNo,
        existing_work_order: duplicate.id,
        existing_status: duplicate.status,
        existing_correlation_id: duplicate.correlation_id
      });
      return res.status(409).json({
        error: 'Bu teslimat zaten isleniyor',
        delivery_no: deliveryNo,
        existing_work_order_id: duplicate.id,
        existing_correlation_id: duplicate.correlation_id,
        existing_status: duplicate.status
      });
    }
  }

  const correlationId = uuidv4();

  logger.info('Inbound: received data', {
    path: incomingPath,
    mapping_id: mapping.id,
    process_type: mapping.process_type,
    company_code: mapping.company_code,
    correlation_id: correlationId
  });

  // ── Adım 1: Alan kurallarını uygula ──
  let transformed = {};
  try {
    transformed = applyFieldRules(inputPayload, mapping.field_rules || []);
  } catch (err) {
    logger.error('Inbound: transform error', { error: err.message, correlation_id: correlationId });
    await transactionStore.create({
      correlation_id: correlationId,
      direction: 'INBOUND',
      action: 'INBOUND_' + mapping.process_type,
      status: 'FAILED',
      sap_function: incomingPath,
      sap_request: inputPayload,
      sap_response: null,
      error_message: 'Transform error: ' + err.message,
      retry_count: 0,
      started_at: receivedAt,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime
    });
    return res.status(400).json({
      error: 'Field transformation failed',
      detail: err.message,
      correlation_id: correlationId
    });
  }

  const transformCompletedAt = new Date().toISOString();
  const rulesApplied = (mapping.field_rules || []).filter(r => r.sap_field && r.threepl_field).length;

  // ── Adım 2: INBOUND transaction kaydı ──
  const inboundTx = await transactionStore.create({
    correlation_id: correlationId,
    direction: 'INBOUND',
    action: 'INBOUND_' + mapping.process_type,
    status: 'SUCCESS',
    sap_function: incomingPath,
    sap_doc_number: deliveryNo,
    sap_request: inputPayload,
    sap_response: transformed,
    error_message: null,
    retry_count: 0,
    started_at: receivedAt,
    completed_at: transformCompletedAt,
    duration_ms: Date.now() - startTime
  });

  // ── Adım 3: Kategoriye göre kuyruğa ekle ──
  const mappingPayload = {
    id: mapping.id,
    process_type: mapping.process_type,
    company_code: mapping.company_code,
    warehouse_code: mapping.warehouse_code || null,
    api_endpoint: mapping.api_endpoint || null,
    http_method: mapping.http_method || 'POST',
    headers: mapping.headers || [],
    security_profile_id: mapping.security_profile_id || null,
    response_rules: mapping.response_rules || []
  };

  let job;
  let jobType;

  if (isWorkOrder) {
    // WORK_ORDER: İş emri oluştur, ardından 3PL'e dispatch
    jobType = 'CREATE_WORK_ORDER';
    job = await pgQueue.enqueue(jobType, correlationId, {
      original: inputPayload,
      transformed: transformed,
      mapping: mappingPayload,
      inbound_tx_id: inboundTx.id
    }, { delivery_no: deliveryNo });
  } else {
    // MASTER_DATA: İş emri oluşturma, direkt 3PL'e dispatch et
    if (mapping.api_endpoint) {
      jobType = 'DISPATCH_TO_3PL';
      job = await pgQueue.enqueue(jobType, correlationId, {
        transformed: transformed,
        mapping: mappingPayload,
        inbound_tx_id: inboundTx.id
      });
    } else {
      // api_endpoint yoksa sadece INBOUND log kalır
      jobType = null;
      job = null;
    }
  }

  // ── Adım 4: Hızlı yanıt dön ──
  res.json({
    status: 'received',
    correlation_id: correlationId,
    received_at: receivedAt,
    category: mapping.category || 'WORK_ORDER',
    mapping: {
      id: mapping.id,
      process_type: mapping.process_type,
      company_code: mapping.company_code,
      direction: mapping.direction,
      description: mapping.description
    },
    original_payload: inputPayload,
    transformed_payload: transformed,
    field_rules_applied: rulesApplied,
    queue: job ? {
      job_id: job.id,
      job_type: jobType,
      status: 'PENDING'
    } : null
  });
  } catch (err) {
    logger.error('Inbound: unhandled error', { error: err.message, path: req.path });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
