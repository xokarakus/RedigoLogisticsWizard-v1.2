const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const DbStore = require('../../shared/database/dbStore');
const logger = require('../../shared/utils/logger');
const sapClient = require('../../shared/sap/client');
const { dispatch } = require('../../shared/utils/httpDispatcher');
const { applyFieldRules } = require('../../shared/utils/fieldTransformer');
const { tenantFilter } = require('../../shared/middleware/auth');
const { logAudit } = require('../../shared/middleware/auditLog');

const workOrderStore = new DbStore('work_orders');
const transactionStore = new DbStore('transaction_logs');
const pcStore = new DbStore('process_configs');
const fmStore = new DbStore('field_mappings');

async function findWorkOrder(deliveryNo, req) {
  const orders = await workOrderStore.readAll({ filter: tenantFilter(req) });
  return orders.find(wo => wo.sap_delivery_no === deliveryNo) || null;
}

async function findProcessConfig(plantCode, warehouseCode, deliveryType) {
  const configs = await pcStore.readAll();
  return configs.find(c =>
    c.plant_code === plantCode &&
    c.warehouse_code === warehouseCode &&
    c.delivery_type === deliveryType
  ) || null;
}

/* ═══════════════════════════════════════════
   POST /api/trigger/fetch-from-sap
   SAP'den teslimat verisini çeker (RFC)
   ═══════════════════════════════════════════ */
router.post('/fetch-from-sap', async (req, res) => {
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  try {
    const { delivery_no, plant_code, warehouse_code, delivery_type } = req.body;
    if (!delivery_no) {
      return res.status(400).json({ error: 'delivery_no zorunludur' });
    }

    const wo = await findWorkOrder(delivery_no, req);
    if (!wo) {
      return res.status(404).json({ error: 'İş emri bulunamadı', delivery_no });
    }

    // Process config'den BAPI adını al
    const config = await findProcessConfig(
      plant_code || wo.plant_code,
      warehouse_code || wo.warehouse_code,
      delivery_type || wo.sap_delivery_type
    );
    const bapiName = (config && config.bapi_name) || 'BAPI_OUTB_DELIVERY_CHANGE';

    // SAP RFC çağır
    const rfcParams = { VBELN: delivery_no };
    const rfcResult = await sapClient.call(bapiName, rfcParams);

    // Work order güncelle — SAP'den taze veri
    const updateData = {};
    if (rfcResult && rfcResult.E_VBELN) {
      updateData.sap_delivery_no = rfcResult.E_VBELN;
    }
    // RFC yanıtını mevcut sap_raw_payload'a birleştir
    const existingPayload = wo.sap_raw_payload || {};
    updateData.sap_raw_payload = { ...existingPayload, _rfc_refresh: rfcResult };

    await workOrderStore.update(wo.id, updateData);
    logAudit(req, 'work_order', wo.id, 'SAP_REFRESH', null, { bapi: bapiName });

    // Transaction log
    const correlationId = wo.correlation_id || uuidv4();
    await transactionStore.create({
      work_order_id: wo.id,
      tenant_id: req.tenantId,
      correlation_id: correlationId,
      direction: 'INBOUND',
      action: 'FETCH_FROM_SAP',
      status: 'SUCCESS',
      sap_function: bapiName,
      sap_doc_number: delivery_no,
      sap_request: rfcParams,
      sap_response: rfcResult,
      error_message: null,
      retry_count: 0,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime
    });

    logger.info('fetch-from-sap completed', {
      delivery_no,
      bapi: bapiName,
      duration_ms: Date.now() - startTime
    });

    res.json({
      ok: true,
      delivery_no,
      bapi: bapiName,
      rfc_result: rfcResult,
      duration_ms: Date.now() - startTime
    });
  } catch (err) {
    logger.error('fetch-from-sap error', { error: err.message });

    // Hata transaction log
    const woForErr = req.body.delivery_no ? await findWorkOrder(req.body.delivery_no, req).catch(() => null) : null;
    await transactionStore.create({
      work_order_id: woForErr ? woForErr.id : null,
      tenant_id: req.tenantId,
      correlation_id: uuidv4(),
      direction: 'INBOUND',
      action: 'FETCH_FROM_SAP',
      status: 'FAILED',
      sap_function: 'BAPI_OUTB_DELIVERY_CHANGE',
      sap_doc_number: req.body.delivery_no,
      sap_request: req.body,
      sap_response: null,
      error_message: err.message,
      retry_count: 0,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime
    });

    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   POST /api/trigger/send-to-3pl
   İş emrini 3PL/WMS'e gönderir
   ═══════════════════════════════════════════ */
router.post('/send-to-3pl', async (req, res) => {
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  try {
    const { delivery_no, plant_code, warehouse_code, delivery_type } = req.body;
    if (!delivery_no) {
      return res.status(400).json({ error: 'delivery_no zorunludur' });
    }

    const wo = await findWorkOrder(delivery_no, req);
    if (!wo) {
      return res.status(404).json({ error: 'İş emri bulunamadı', delivery_no });
    }

    const correlationId = wo.correlation_id || uuidv4();
    const effectivePlant = plant_code || wo.plant_code;
    const effectiveWarehouse = warehouse_code || wo.warehouse_code;
    const effectiveDeliveryType = delivery_type || wo.sap_delivery_type;

    // Process config bul
    const config = await findProcessConfig(effectivePlant, effectiveWarehouse, effectiveDeliveryType);

    // Field mapping bul — process_type + company_code eşleştir
    const allMappings = await fmStore.readAll();
    const processType = (config && config.process_type) || wo.process_type || '';
    const companyCode = (config && config.company_code) || '';

    const mapping = allMappings.find(fm =>
      fm.is_active &&
      fm.process_type === processType &&
      (fm.company_code === companyCode || !companyCode)
    );

    // SAP payload'ı dönüştür
    const sapPayload = wo.sap_raw_payload || {};
    let transformed = sapPayload;
    if (mapping && mapping.field_rules && mapping.field_rules.length > 0) {
      transformed = applyFieldRules(sapPayload, mapping.field_rules);
    }

    // 3PL API endpoint
    const apiEndpoint = (mapping && mapping.api_endpoint) ||
                        (config && config.api_base_url) ||
                        null;

    let dispatchResult;
    if (apiEndpoint) {
      // Gerçek dispatch
      dispatchResult = await dispatch({
        url: apiEndpoint,
        method: (mapping && mapping.http_method) || 'POST',
        headers: (mapping && mapping.headers) || [],
        securityProfileId: (mapping && mapping.security_profile_id) || null,
        body: transformed
      });
    } else {
      // Demo mode — API endpoint tanımlı değil
      dispatchResult = {
        ok: true,
        statusCode: 200,
        statusText: 'OK (Demo)',
        responseBody: { status: 'accepted', order_id: 'WMS-' + delivery_no },
        duration_ms: Date.now() - startTime,
        error: null
      };
    }

    // Transaction log
    await transactionStore.create({
      work_order_id: wo.id,
      tenant_id: req.tenantId,
      correlation_id: correlationId,
      direction: 'OUTBOUND',
      action: 'OUTBOUND_' + processType,
      status: dispatchResult.ok ? 'SUCCESS' : 'FAILED',
      sap_function: apiEndpoint || '(demo)',
      sap_doc_number: delivery_no,
      sap_request: transformed,
      sap_response: dispatchResult.responseBody,
      error_message: dispatchResult.error,
      retry_count: 0,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: dispatchResult.duration_ms || (Date.now() - startTime)
    });

    if (dispatchResult.ok) {
      // WO status güncelle
      const wmsOrderId = dispatchResult.responseBody && dispatchResult.responseBody.order_id
        ? dispatchResult.responseBody.order_id : null;

      const oldStatus = wo.status;
      await workOrderStore.update(wo.id, {
        status: 'SENT_TO_WMS',
        sent_to_wms_at: new Date().toISOString(),
        wms_order_id: wmsOrderId,
        wms_raw_payload: dispatchResult.responseBody
      });
      logAudit(req, 'work_order', wo.id, 'STATUS_CHANGE', { status: oldStatus }, {
        status: 'SENT_TO_WMS', wms_order_id: wmsOrderId
      });

      logger.info('send-to-3pl completed', {
        delivery_no,
        target: apiEndpoint || '(demo)',
        statusCode: dispatchResult.statusCode,
        duration_ms: Date.now() - startTime
      });

      res.json({
        ok: true,
        delivery_no,
        target: apiEndpoint || '(demo)',
        statusCode: dispatchResult.statusCode,
        wms_order_id: wmsOrderId,
        duration_ms: Date.now() - startTime
      });
    } else {
      const oldStatus2 = wo.status;
      await workOrderStore.update(wo.id, {
        status: 'DISPATCH_FAILED',
        wms_raw_payload: dispatchResult.responseBody
      });
      logAudit(req, 'work_order', wo.id, 'STATUS_CHANGE', { status: oldStatus2 }, {
        status: 'DISPATCH_FAILED', error: dispatchResult.error
      });

      res.status(502).json({
        ok: false,
        delivery_no,
        target: apiEndpoint,
        statusCode: dispatchResult.statusCode,
        error: dispatchResult.error,
        duration_ms: Date.now() - startTime
      });
    }
  } catch (err) {
    logger.error('send-to-3pl error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   POST /api/trigger/query-status
   3PL'den sipariş durumu sorgula
   ═══════════════════════════════════════════ */
router.post('/query-status', async (req, res) => {
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  try {
    const { delivery_no } = req.body;
    if (!delivery_no) {
      return res.status(400).json({ error: 'delivery_no zorunludur' });
    }

    const wo = await findWorkOrder(delivery_no, req);
    if (!wo) {
      return res.status(404).json({ error: 'İş emri bulunamadı', delivery_no });
    }

    const correlationId = wo.correlation_id || uuidv4();

    // 3PL'den durum sorgula — şimdilik mock
    const queryResult = {
      ok: true,
      statusCode: 200,
      responseBody: {
        order_id: wo.wms_order_id || 'WMS-' + delivery_no,
        status: wo.status === 'SENT_TO_WMS' ? 'IN_PROGRESS' : wo.status,
        updated_at: new Date().toISOString()
      },
      duration_ms: Date.now() - startTime
    };

    // Transaction log
    await transactionStore.create({
      work_order_id: wo.id,
      tenant_id: req.tenantId,
      correlation_id: correlationId,
      direction: 'INBOUND',
      action: 'QUERY_STATUS',
      status: 'SUCCESS',
      sap_function: '3PL Status Query',
      sap_doc_number: delivery_no,
      sap_request: { delivery_no, wms_order_id: wo.wms_order_id },
      sap_response: queryResult.responseBody,
      error_message: null,
      retry_count: 0,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime
    });

    // WO status güncelle (3PL'den gelen duruma göre)
    const wmsStatus = queryResult.responseBody.status;
    const oldStatus = wo.status;
    if (wmsStatus === 'IN_PROGRESS' && wo.status === 'SENT_TO_WMS') {
      await workOrderStore.update(wo.id, { status: 'IN_PROGRESS' });
      logAudit(req, 'work_order', wo.id, 'STATUS_CHANGE', { status: oldStatus }, { status: 'IN_PROGRESS' });
    } else if (wmsStatus === 'COMPLETED' || wmsStatus === 'DONE') {
      await workOrderStore.update(wo.id, {
        status: 'COMPLETED',
        completed_at: new Date().toISOString()
      });
      logAudit(req, 'work_order', wo.id, 'STATUS_CHANGE', { status: oldStatus }, { status: 'COMPLETED' });
    }

    logger.info('query-status completed', {
      delivery_no,
      wms_status: wmsStatus,
      duration_ms: Date.now() - startTime
    });

    res.json({
      ok: true,
      delivery_no,
      wms_order_id: wo.wms_order_id,
      wms_status: wmsStatus,
      duration_ms: Date.now() - startTime
    });
  } catch (err) {
    logger.error('query-status error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
