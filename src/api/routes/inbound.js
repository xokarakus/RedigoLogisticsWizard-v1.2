const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const DbStore = require('../../shared/database/dbStore');
const logger = require('../../shared/utils/logger');
const { applyFieldRules, validateRequiredFields } = require('../../shared/utils/fieldTransformer');
const pgQueue = require('../../shared/queue/pgQueue');
const { ACTIVE_STATUSES, CLOSED_STATUSES } = require('../../shared/constants/statuses');
const { fieldMappingCache } = require('../../shared/utils/cacheStore');
const { sanitizePayload } = require('../../shared/utils/securityUtils');
const { webhookAuth } = require('../../shared/middleware/webhookAuth');

// Webhook auth: X-API-Key dogrulamasi
router.use(webhookAuth({ settingsKey: 'webhook_inbound' }));

const fieldMappingStore = new DbStore('field_mappings');
const transactionStore = new DbStore('transaction_logs');
const workOrderStore = new DbStore('work_orders');

/**
 * Dinamik Inbound Endpoint
 * SAP bu endpoint'e POST yaparak kokpite veri gonderir.
 * URL pattern: /api/inbound/:processSlug/:companySlug
 *
 * Pipeline:
 * 1. Gelen URL'i field_mappings'deki source_api_endpoint ile eslestir
 * 2. Eslesen mapping'in field_rules'ini uygula (SAP -> 3PL donusumu)
 * 3. INBOUND transaction kaydi olustur (correlation_id ile)
 * 4. CREATE_WORK_ORDER isini kuyruga ekle (asenkron)
 *    -> Worker: is emri olusturur, api_endpoint varsa DISPATCH_TO_3PL kuyruga ekler
 * 5. correlation_id ile hizli yanit don
 */
router.all('/*', async (req, res) => {
  try {
  const incomingPath = '/api/inbound' + req.path;
  let mappings = fieldMappingCache.get('all');
  if (!mappings) {
    mappings = await fieldMappingStore.readAll();
    fieldMappingCache.set('all', mappings);
  }

  // source_api_endpoint ile eslestir
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
  const tenantId = mapping.tenant_id || null;

  // -- Duplike kontrolu: yalnizca WORK_ORDER kategorisi icin --
  const deliveryNo = inputPayload.HEADER
    ? inputPayload.HEADER.VBELN
    : (inputPayload.VBELN || null);

  if (isWorkOrder && deliveryNo) {
    const dupFilter = { sap_delivery_no: deliveryNo };
    if (tenantId) dupFilter.tenant_id = tenantId;
    const existingOrders = await workOrderStore.findBy(dupFilter, { limit: 10 });
    const duplicate = existingOrders.find(wo =>
      ACTIVE_STATUSES.includes(wo.status)
    );

    if (duplicate) {
      const isClosed = CLOSED_STATUSES.includes(duplicate.status);
      logger.warn('Inbound: duplicate delivery rejected', {
        delivery_no: deliveryNo,
        existing_work_order: duplicate.id,
        existing_status: duplicate.status,
        existing_correlation_id: duplicate.correlation_id,
        closed: isClosed
      });
      return res.status(409).json({
        error: isClosed
          ? 'Bu teslimat tamamlanmis/iptal edilmis, tekrar gonderilemez'
          : 'Bu teslimat zaten isleniyor',
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

  // -- Adim 0: Zorunlu alan kontrolu --
  const reqCheck = validateRequiredFields(inputPayload, mapping.field_rules || []);
  if (!reqCheck.valid) {
    logger.warn('Inbound: required fields missing', {
      correlation_id: correlationId,
      missing: reqCheck.missing
    });
    await transactionStore.create({
      correlation_id: correlationId,
      direction: 'INBOUND',
      action: 'INBOUND_' + mapping.process_type,
      status: 'FAILED',
      sap_function: incomingPath,
      sap_request: sanitizePayload(inputPayload),
      sap_response: null,
      error_message: 'Zorunlu alanlar eksik: ' + reqCheck.missing.join(', '),
      retry_count: 0,
      started_at: receivedAt,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      tenant_id: tenantId
    });
    return res.status(400).json({
      error: 'Zorunlu alanlar eksik',
      missing_fields: reqCheck.missing,
      correlation_id: correlationId
    });
  }

  // -- Adim 1: Alan kurallarini uygula --
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
      sap_request: sanitizePayload(inputPayload),
      sap_response: null,
      error_message: 'Transform error: ' + err.message,
      retry_count: 0,
      started_at: receivedAt,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      tenant_id: tenantId
    });
    return res.status(400).json({
      error: 'Field transformation failed',
      detail: err.message,
      correlation_id: correlationId
    });
  }

  const transformCompletedAt = new Date().toISOString();
  const rulesApplied = (mapping.field_rules || []).filter(r => r.sap_field && r.threepl_field).length;

  // -- Adim 2: INBOUND transaction kaydi --
  const inboundTx = await transactionStore.create({
    correlation_id: correlationId,
    direction: 'INBOUND',
    action: 'INBOUND_' + mapping.process_type,
    status: 'SUCCESS',
    sap_function: incomingPath,
    sap_doc_number: deliveryNo,
    sap_request: sanitizePayload(inputPayload),
    sap_response: transformed,
    error_message: null,
    retry_count: 0,
    started_at: receivedAt,
    completed_at: transformCompletedAt,
    duration_ms: Date.now() - startTime,
    tenant_id: tenantId
  });

  // -- Adim 3: Kategoriye gore kuyruga ekle --
  const mappingPayload = {
    id: mapping.id,
    process_type: mapping.process_type,
    company_code: mapping.company_code,
    warehouse_code: mapping.warehouse_code || null,
    api_endpoint: mapping.api_endpoint || null,
    http_method: mapping.http_method || 'POST',
    headers: mapping.headers || [],
    security_profile_id: mapping.security_profile_id || null,
    response_rules: mapping.response_rules || [],
    timeout_ms: mapping.timeout_ms || 30000,
    tenant_id: tenantId
  };

  let job;
  let jobType;

  if (isWorkOrder) {
    // WORK_ORDER: Is emri olustur, ardindan 3PL'e dispatch
    jobType = 'CREATE_WORK_ORDER';
    job = await pgQueue.enqueue(jobType, correlationId, {
      original: inputPayload,
      transformed: transformed,
      mapping: mappingPayload,
      inbound_tx_id: inboundTx.id
    }, { delivery_no: deliveryNo });
  } else {
    // MASTER_DATA: Is emri olusturma, direkt 3PL'e dispatch et
    if (mapping.api_endpoint) {
      jobType = 'DISPATCH_TO_3PL';
      job = await pgQueue.enqueue(jobType, correlationId, {
        transformed: transformed,
        mapping: mappingPayload,
        inbound_tx_id: inboundTx.id
      });
    } else {
      // api_endpoint yoksa sadece INBOUND log kalir
      jobType = null;
      job = null;
    }
  }

  // -- Adim 4: Hizli yanit don --
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
