const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const DbStore = require('../../shared/database/dbStore');
const logger = require('../../shared/utils/logger');
const { dispatch } = require('../../shared/utils/httpDispatcher');
const { applyFieldRules, applyResponseRules } = require('../../shared/utils/fieldTransformer');

const fieldMappingStore = new DbStore('field_mappings');
const transactionStore = new DbStore('transaction_logs');

/**
 * Dinamik Inbound Endpoint
 * SAP bu endpoint'e POST yaparak kokpite veri gönderir.
 * URL pattern: /api/inbound/:processSlug/:companySlug
 *
 * Tam pipeline:
 * 1. Gelen URL'i field_mappings.json içindeki source_api_endpoint ile eşleştir
 * 2. Eşleşen mapping'in field_rules'ını uygula (SAP → 3PL dönüşümü)
 * 3. INBOUND transaction kaydı oluştur (correlation_id ile)
 * 4. Mapping'de api_endpoint varsa → dönüştürülmüş veriyi 3PL'e gönder
 * 5. OUTBOUND transaction kaydı oluştur (aynı correlation_id)
 * 6. Sonucu döndür
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
  const inboundTx = await transactionStore.create({
    correlation_id: correlationId,
    direction: 'INBOUND',
    action: 'INBOUND_' + mapping.process_type,
    status: 'SUCCESS',
    sap_function: incomingPath,
    sap_doc_number: inputPayload.HEADER ? inputPayload.HEADER.VBELN : (inputPayload.VBELN || null),
    sap_request: inputPayload,
    sap_response: transformed,
    error_message: null,
    retry_count: 0,
    started_at: receivedAt,
    completed_at: transformCompletedAt,
    duration_ms: Date.now() - startTime
  });

  // ── Adım 3: 3PL'e Dispatch (api_endpoint varsa) ──
  let dispatchResult = null;
  if (mapping.api_endpoint) {
    const dispatchStartTime = Date.now();
    const dispatchStartedAt = new Date().toISOString();

    try {
      dispatchResult = await dispatch({
        url: mapping.api_endpoint,
        method: mapping.http_method || 'POST',
        headers: mapping.headers || [],
        securityProfileId: mapping.security_profile_id,
        body: transformed
      });

      // OUTBOUND transaction kaydı
      await transactionStore.create({
        correlation_id: correlationId,
        direction: 'OUTBOUND',
        action: 'OUTBOUND_' + mapping.process_type,
        status: dispatchResult.ok ? 'SUCCESS' : 'FAILED',
        sap_function: mapping.api_endpoint,
        sap_doc_number: inputPayload.HEADER ? inputPayload.HEADER.VBELN : (inputPayload.VBELN || null),
        sap_request: transformed,
        sap_response: dispatchResult.responseBody,
        error_message: dispatchResult.error,
        retry_count: 0,
        started_at: dispatchStartedAt,
        completed_at: new Date().toISOString(),
        duration_ms: dispatchResult.duration_ms
      });

      logger.info('Dispatch completed', {
        correlation_id: correlationId,
        target: mapping.api_endpoint,
        status: dispatchResult.ok ? 'SUCCESS' : 'FAILED',
        statusCode: dispatchResult.statusCode,
        duration_ms: dispatchResult.duration_ms
      });
    } catch (err) {
      logger.error('Dispatch unexpected error', { correlation_id: correlationId, error: err.message });
      dispatchResult = { ok: false, error: err.message, statusCode: 0, duration_ms: Date.now() - dispatchStartTime };
      await transactionStore.create({
        correlation_id: correlationId,
        direction: 'OUTBOUND',
        action: 'OUTBOUND_' + mapping.process_type,
        status: 'FAILED',
        sap_function: mapping.api_endpoint,
        sap_request: transformed,
        sap_response: null,
        error_message: err.message,
        retry_count: 0,
        started_at: dispatchStartedAt,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - dispatchStartTime
      });
    }
  } else {
    logger.info('Dispatch skipped: no api_endpoint configured', { correlation_id: correlationId });
  }

  // ── Adım 4: Response rules uygula (3PL yanıtını dönüştür) ──
  let transformedResponse = null;
  const responseRules = mapping.response_rules || [];
  if (dispatchResult && dispatchResult.responseBody && responseRules.length > 0) {
    try {
      transformedResponse = applyResponseRules(dispatchResult.responseBody, responseRules);
      logger.info('Response rules applied', { correlation_id: correlationId, rules_count: responseRules.length });
    } catch (err) {
      logger.error('Response rules error', { correlation_id: correlationId, error: err.message });
    }
  }

  // ── Adım 5: Sonucu döndür ──
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
    dispatch: dispatchResult ? {
      target: mapping.api_endpoint,
      method: mapping.http_method || 'POST',
      ok: dispatchResult.ok,
      statusCode: dispatchResult.statusCode,
      statusText: dispatchResult.statusText,
      duration_ms: dispatchResult.duration_ms,
      error: dispatchResult.error,
      responseBody: dispatchResult.responseBody,
      transformedResponse: transformedResponse
    } : { skipped: true, reason: 'No api_endpoint configured' }
  });
});

module.exports = router;
