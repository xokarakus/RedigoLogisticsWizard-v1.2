const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const DbStore = require('../../shared/database/dbStore');
const logger = require('../../shared/utils/logger');
const { applyFieldRules } = require('../../shared/utils/fieldTransformer');
const pgQueue = require('../../shared/queue/pgQueue');

const fieldMappingStore = new DbStore('field_mappings');
const transactionStore = new DbStore('transaction_logs');

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
  const deliveryNo = inputPayload.HEADER
    ? inputPayload.HEADER.VBELN
    : (inputPayload.VBELN || null);

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

  // ── Adım 3: CREATE_WORK_ORDER kuyruğa ekle ──
  const job = await pgQueue.enqueue('CREATE_WORK_ORDER', correlationId, {
    original: inputPayload,
    transformed: transformed,
    mapping: {
      id: mapping.id,
      process_type: mapping.process_type,
      company_code: mapping.company_code,
      warehouse_code: mapping.warehouse_code || null,
      api_endpoint: mapping.api_endpoint || null,
      http_method: mapping.http_method || 'POST',
      headers: mapping.headers || [],
      security_profile_id: mapping.security_profile_id || null,
      response_rules: mapping.response_rules || []
    },
    inbound_tx_id: inboundTx.id
  }, { delivery_no: deliveryNo });

  // ── Adım 4: Hızlı yanıt dön ──
  res.json({
    status: 'received',
    correlation_id: correlationId,
    received_at: receivedAt,
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
    queue: {
      job_id: job.id,
      job_type: 'CREATE_WORK_ORDER',
      status: 'PENDING'
    }
  });
});

module.exports = router;
