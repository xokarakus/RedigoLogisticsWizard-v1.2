/**
 * WorkOrderQueueHandler — Kuyruk iş tanımları
 *
 * CREATE_WORK_ORDER: SAP payload'dan iş emri oluştur/güncelle
 * DISPATCH_TO_3PL:   Dönüştürülmüş veriyi 3PL API'ye gönder
 */

const DbStore = require('../../../shared/database/dbStore');
const pgQueue = require('../../../shared/queue/pgQueue');
const { dispatch } = require('../../../shared/utils/httpDispatcher');
const { applyResponseRules } = require('../../../shared/utils/fieldTransformer');
const logger = require('../../../shared/utils/logger');

const workOrderStore = new DbStore('work_orders');
const transactionStore = new DbStore('transaction_logs');

/**
 * CREATE_WORK_ORDER Handler
 *
 * SAP payload'dan iş emri oluşturur.
 * Aynı sap_delivery_no ile tekrar gelirse günceller (idempotent).
 * api_endpoint varsa DISPATCH_TO_3PL işi kuyruğa ekler.
 *
 * job.payload:
 *   - original: SAP'dan gelen ham payload
 *   - transformed: field_rules uygulanmış payload
 *   - mapping: { id, process_type, company_code, api_endpoint, http_method, headers, security_profile_id, response_rules }
 *   - inbound_tx_id: INBOUND transaction log ID
 */
async function handleCreateWorkOrder(job) {
  const { original, transformed, mapping, inbound_tx_id } = job.payload;

  // SAP payload'dan iş emri alanlarını çıkar
  const header = original.HEADER || original;
  const deliveryNo = header.VBELN || original.VBELN || job.delivery_no || null;
  const deliveryType = header.LFART || original.LFART || null;
  const plantCode = header.WERKS || original.WERKS || '1000';
  const shipTo = header.KUNNR || original.KUNNR || null;
  const soldTo = header.KUNAG || original.KUNAG || null;
  const docDate = header.ERDAT || original.ERDAT || null;

  // ITEMS → lines
  const items = original.ITEMS || original.items || [];
  const lines = items.map((item, idx) => ({
    line_no: item.POSNR || String((idx + 1) * 10),
    material: item.MATNR || item.material,
    quantity: parseFloat(item.LFIMG || item.quantity || 0),
    uom: item.VRKME || item.uom || 'EA',
    batch: item.CHARG || item.batch || null,
    description: item.MAKTX || item.description || null
  }));

  // Process type → order_type eşlemesi
  const processType = mapping.process_type || '';
  let orderType = 'OUTBOUND';
  if (processType.startsWith('GR') || processType === 'INBOUND' || processType === 'RETURN') {
    orderType = 'INBOUND';
  }

  // İdempotent: aynı delivery_no + correlation_id varsa güncelle
  let workOrder = null;
  if (deliveryNo) {
    const existing = await workOrderStore.readAll();
    workOrder = existing.find(wo =>
      wo.sap_delivery_no === deliveryNo && wo.correlation_id === job.correlation_id
    );
  }

  if (workOrder) {
    // Güncelle
    workOrder = await workOrderStore.update(workOrder.id, {
      sap_delivery_type: deliveryType || workOrder.sap_delivery_type,
      plant_code: plantCode,
      lines: lines.length > 0 ? lines : workOrder.lines,
      sap_raw_payload: original,
      status: workOrder.status === 'FAILED' ? 'RECEIVED' : workOrder.status
    });

    logger.info('Work order updated', {
      work_order_id: workOrder.id,
      delivery_no: deliveryNo,
      correlation_id: job.correlation_id
    });
  } else {
    // Yeni oluştur
    workOrder = await workOrderStore.create({
      sap_delivery_no: deliveryNo || 'N/A',
      sap_delivery_type: deliveryType || 'XX',
      sap_doc_date: docDate,
      sap_ship_to: shipTo,
      sap_sold_to: soldTo,
      order_type: orderType,
      status: 'RECEIVED',
      warehouse_code: mapping.warehouse_code || null,
      plant_code: plantCode,
      correlation_id: job.correlation_id,
      priority: 'MEDIUM',
      received_at: new Date().toISOString(),
      lines: lines,
      sap_raw_payload: original
    });

    logger.info('Work order created', {
      work_order_id: workOrder.id,
      delivery_no: deliveryNo,
      correlation_id: job.correlation_id,
      order_type: orderType
    });
  }

  // Transaction log'u work_order'a bağla (correlation_id üzerinden zaten bağlı)

  // api_endpoint varsa → DISPATCH_TO_3PL kuyruğa ekle
  if (mapping.api_endpoint) {
    await pgQueue.enqueue('DISPATCH_TO_3PL', job.correlation_id, {
      work_order_id: workOrder.id,
      transformed: transformed,
      mapping: mapping,
      delivery_no: deliveryNo
    }, { delivery_no: deliveryNo });
  }

  return {
    work_order_id: workOrder.id,
    delivery_no: deliveryNo,
    status: workOrder.status,
    dispatch_queued: !!mapping.api_endpoint
  };
}

/**
 * DISPATCH_TO_3PL Handler
 *
 * Dönüştürülmüş payload'ı 3PL API'ye gönderir.
 * Başarılı → work_order.status = SENT_TO_WMS
 * Başarısız → throw → retry (exponential backoff)
 *
 * job.payload:
 *   - work_order_id: İş emri ID
 *   - transformed: Gönderilecek payload
 *   - mapping: { api_endpoint, http_method, headers, security_profile_id, response_rules }
 *   - delivery_no: SAP teslimat no
 */
async function handleDispatchTo3PL(job) {
  const { work_order_id, transformed, mapping, delivery_no } = job.payload;

  const dispatchStartTime = Date.now();
  const dispatchStartedAt = new Date().toISOString();

  // 3PL'e gönder
  const dispatchResult = await dispatch({
    url: mapping.api_endpoint,
    method: mapping.http_method || 'POST',
    headers: mapping.headers || [],
    securityProfileId: mapping.security_profile_id,
    body: transformed
  });

  // Response rules uygula
  let transformedResponse = null;
  const responseRules = mapping.response_rules || [];
  if (dispatchResult.responseBody && responseRules.length > 0) {
    try {
      transformedResponse = applyResponseRules(dispatchResult.responseBody, responseRules);
    } catch (err) {
      logger.error('Response rules error in dispatch', {
        correlation_id: job.correlation_id,
        error: err.message
      });
    }
  }

  // OUTBOUND transaction log
  await transactionStore.create({
    correlation_id: job.correlation_id,
    direction: 'OUTBOUND',
    action: 'OUTBOUND_' + (mapping.process_type || 'DISPATCH'),
    status: dispatchResult.ok ? 'SUCCESS' : 'FAILED',
    sap_function: mapping.api_endpoint,
    sap_doc_number: delivery_no,
    sap_request: transformed,
    sap_response: dispatchResult.responseBody,
    error_message: dispatchResult.error,
    retry_count: job.attempts || 0,
    started_at: dispatchStartedAt,
    completed_at: new Date().toISOString(),
    duration_ms: dispatchResult.duration_ms
  });

  if (!dispatchResult.ok) {
    // Başarısız → throw → retry mekanizması devreye girecek
    throw new Error(
      '3PL dispatch failed: HTTP ' + dispatchResult.statusCode +
      ' — ' + (dispatchResult.error || 'Unknown error')
    );
  }

  // Başarılı → work_order durumunu güncelle
  await workOrderStore.update(work_order_id, {
    status: 'SENT_TO_WMS',
    sent_to_wms_at: new Date().toISOString(),
    wms_order_id: dispatchResult.responseBody && dispatchResult.responseBody.order_id
      ? dispatchResult.responseBody.order_id
      : null,
    wms_raw_payload: dispatchResult.responseBody
  });

  logger.info('3PL dispatch successful', {
    correlation_id: job.correlation_id,
    work_order_id: work_order_id,
    delivery_no: delivery_no,
    target: mapping.api_endpoint,
    statusCode: dispatchResult.statusCode,
    duration_ms: dispatchResult.duration_ms
  });

  return {
    ok: true,
    statusCode: dispatchResult.statusCode,
    duration_ms: dispatchResult.duration_ms,
    transformedResponse: transformedResponse
  };
}

module.exports = {
  CREATE_WORK_ORDER: handleCreateWorkOrder,
  DISPATCH_TO_3PL: handleDispatchTo3PL
};
