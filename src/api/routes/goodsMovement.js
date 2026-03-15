const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const DbStore = require('../../shared/database/dbStore');
const logger = require('../../shared/utils/logger');
const sapClient = require('../../shared/sap/client');
const { tenantFilter } = require('../../shared/middleware/auth');
const { logAudit } = require('../../shared/middleware/auditLog');

const { validate } = require('../../shared/validators/middleware');
const { GoodsMovementSchema } = require('../../shared/validators/workOrder.schemas');

const workOrderStore = new DbStore('work_orders');
const transactionStore = new DbStore('transaction_logs');
const pcStore = new DbStore('process_configs');

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

/**
 * Ortak goods movement handler
 * PGI ve GR aynı akışı paylaşır, farklar: mvt_type, gm_code, hedef status, action adı
 */
async function handleGoodsMovement(req, res, opts) {
  const { actionName, targetStatus } = opts;
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  try {
    const { delivery_no, plant_code, warehouse_code, delivery_type, mvt_type } = req.body;
    if (!delivery_no) {
      return res.status(400).json({ error: 'delivery_no zorunludur' });
    }
    // WERKS ve LGORT zorunlu (WO'da yoksa body'den gelmeli)
    if (!plant_code && !delivery_no) {
      return res.status(400).json({ error: 'plant_code (WERKS) zorunludur' });
    }

    const wo = await findWorkOrder(delivery_no, req);
    if (!wo) {
      return res.status(404).json({ error: 'İş emri bulunamadı', delivery_no });
    }

    const correlationId = wo.correlation_id || uuidv4();
    const effectivePlant = plant_code || wo.plant_code;
    const effectiveWarehouse = warehouse_code || wo.warehouse_code;
    const effectiveDeliveryType = delivery_type || wo.sap_delivery_type;

    // Process config'den mvt_type ve gm_code al
    const config = await findProcessConfig(effectivePlant, effectiveWarehouse, effectiveDeliveryType);
    const effectiveMvtType = mvt_type || (config && config.mvt_type) || (targetStatus === 'PGI_POSTED' ? '601' : '101');
    const gmCode = (config && config.gm_code) || (targetStatus === 'PGI_POSTED' ? '03' : '01');

    // BAPI_GOODSMVT_CREATE parametreleri
    const gmHeader = {
      PSTNG_DATE: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      DOC_DATE: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      PR_UNAME: 'COCKPIT'
    };

    const gmCode_param = { GM_CODE: gmCode };

    // İş emri kalemlerinden BAPI item'ları oluştur
    const lines = wo.lines || [];
    const gmItems = lines.map((line, idx) => ({
      MATERIAL: line.sap_material || '',
      PLANT: effectivePlant,
      STGE_LOC: wo.sap_stor_loc || (wo.sap_raw_payload && wo.sap_raw_payload.HEADER && wo.sap_raw_payload.HEADER.LGORT) || '',
      MOVE_TYPE: effectiveMvtType,
      ENTRY_QNT: line.sap_requested_qty || 0,
      ENTRY_UOM: line.sap_uom || 'EA',
      BATCH: line.sap_batch || '',
      MVT_IND: '',
      ITEM_TEXT: 'Cockpit ' + actionName + ' #' + (idx + 1)
    }));

    const rfcParams = {
      GOODSMVT_HEADER: gmHeader,
      GOODSMVT_CODE: gmCode_param,
      GOODSMVT_ITEM: gmItems
    };

    // SAP RFC çağır
    const rfcResult = await sapClient.call('BAPI_GOODSMVT_CREATE', rfcParams);

    // SAP RETURN kontrolü
    const sapReturn = rfcResult.RETURN || [];
    const hasError = Array.isArray(sapReturn)
      ? sapReturn.some(r => r.TYPE === 'E' || r.TYPE === 'A')
      : (sapReturn.TYPE === 'E' || sapReturn.TYPE === 'A');

    if (hasError) {
      const errorMsg = Array.isArray(sapReturn)
        ? sapReturn.filter(r => r.TYPE === 'E' || r.TYPE === 'A').map(r => r.MESSAGE).join('; ')
        : sapReturn.MESSAGE;

      // Hata transaction log
      await transactionStore.create({
        work_order_id: wo.id,
        tenant_id: req.tenantId,
        correlation_id: correlationId,
        direction: 'OUTBOUND',
        action: actionName,
        status: 'FAILED',
        sap_function: 'BAPI_GOODSMVT_CREATE',
        sap_doc_number: delivery_no,
        sap_request: rfcParams,
        sap_response: rfcResult,
        error_message: errorMsg,
        retry_count: 0,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime
      });

      return res.status(502).json({
        ok: false,
        delivery_no,
        error: errorMsg,
        sap_return: sapReturn,
        duration_ms: Date.now() - startTime
      });
    }

    // BAPI_TRANSACTION_COMMIT
    await sapClient.call('BAPI_TRANSACTION_COMMIT', { WAIT: 'X' });

    // SAP belge numarası
    const matDoc = rfcResult.GOODSMVT_HEADRET
      ? rfcResult.GOODSMVT_HEADRET.MAT_DOC
      : null;
    const docYear = rfcResult.GOODSMVT_HEADRET
      ? rfcResult.GOODSMVT_HEADRET.DOC_YEAR
      : null;

    // Başarılı transaction log
    await transactionStore.create({
      work_order_id: wo.id,
      tenant_id: req.tenantId,
      correlation_id: correlationId,
      direction: 'OUTBOUND',
      action: actionName,
      status: 'SUCCESS',
      sap_function: 'BAPI_GOODSMVT_CREATE',
      sap_doc_number: delivery_no,
      sap_request: rfcParams,
      sap_response: rfcResult,
      error_message: null,
      retry_count: 0,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime
    });

    // WO status güncelle + arsivle (belge kapandi)
    const oldStatus = wo.status;
    const now = new Date().toISOString();
    await workOrderStore.update(wo.id, {
      status: targetStatus,
      sap_posted_at: now,
      completed_at: now,
      archived_at: now,
      notes: actionName + ': MAT_DOC=' + (matDoc || '-') + ' DOC_YEAR=' + (docYear || '-')
    });
    logAudit(req, 'work_order', wo.id, 'STATUS_CHANGE', { status: oldStatus }, {
      status: targetStatus,
      mat_doc: matDoc,
      action: actionName
    });

    logger.info(actionName + ' completed', {
      delivery_no,
      mat_doc: matDoc,
      mvt_type: effectiveMvtType,
      duration_ms: Date.now() - startTime
    });

    res.json({
      ok: true,
      delivery_no,
      mat_doc: matDoc,
      doc_year: docYear,
      mvt_type: effectiveMvtType,
      gm_code: gmCode,
      duration_ms: Date.now() - startTime
    });
  } catch (err) {
    logger.error(actionName + ' error', { error: err.message });

    // Hata transaction log
    const woForErr2 = req.body.delivery_no ? await findWorkOrder(req.body.delivery_no, req).catch(() => null) : null;
    await transactionStore.create({
      work_order_id: woForErr2 ? woForErr2.id : null,
      tenant_id: req.tenantId,
      correlation_id: uuidv4(),
      direction: 'OUTBOUND',
      action: actionName,
      status: 'FAILED',
      sap_function: 'BAPI_GOODSMVT_CREATE',
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
}

/* ═══════════════════════════════════════════
   POST /api/goods-movement/post-pgi
   SAP'de PGI (mal çıkış) kaydet
   ═══════════════════════════════════════════ */
router.post('/post-pgi', validate(GoodsMovementSchema), (req, res) => {
  handleGoodsMovement(req, res, {
    actionName: 'POST_PGI',
    targetStatus: 'PGI_POSTED'
  });
});

/* ═══════════════════════════════════════════
   POST /api/goods-movement/post-gr
   SAP'de GR (mal giriş) kaydet
   ═══════════════════════════════════════════ */
router.post('/post-gr', validate(GoodsMovementSchema), (req, res) => {
  handleGoodsMovement(req, res, {
    actionName: 'POST_GR',
    targetStatus: 'GR_POSTED'
  });
});

module.exports = router;
