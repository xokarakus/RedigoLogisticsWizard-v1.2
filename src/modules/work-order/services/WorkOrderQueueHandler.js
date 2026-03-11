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
const materialStore = new DbStore('materials');
const partnerStore = new DbStore('business_partners');

/** Null-safe numeric conversion — NaN, null, undefined, "" → 0 */
function safeNum(val) {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

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
  const tenantId = mapping.tenant_id || null;

  // SAP payload'dan iş emri alanlarını çıkar
  const header = original.HEADER || original;
  const deliveryNo = header.VBELN || original.VBELN || job.delivery_no || null;
  const deliveryType = header.LFART || original.LFART || null;
  const plantCode = header.WERKS || original.WERKS || '1000';
  const shipTo = header.KUNNR || original.KUNNR || null;
  const soldTo = header.KUNAG || original.KUNAG || null;
  const docDate = header.ERDAT || original.ERDAT || null;
  const storLoc = header.LGORT || original.LGORT || null;
  const targetPlant = header.UMWRK || original.UMWRK || null;
  const targetStorLoc = header.UMLGO || original.UMLGO || null;
  const shippingPoint = header.VSTEL || original.VSTEL || null;
  const vendorNo = header.LIFNR || original.LIFNR || null;

  // ITEMS → lines (WorkOrderDetail.view.xml formatına uyumlu)
  const items = original.ITEMS || original.items || [];
  const lines = items.map((item, idx) => ({
    sap_item_no: item.POSNR || String((idx + 1) * 10),
    sap_material: item.MATNR || item.material || '',
    sap_material_desc: item.MAKTX || item.description || '',
    sap_batch: item.CHARG || item.batch || '',
    sap_requested_qty: safeNum(item.LFIMG ?? item.quantity),
    wms_picked_qty: 0,
    final_qty: 0,
    sap_uom: item.VRKME || item.uom || 'EA',
    sap_gross_weight: safeNum(item.BRGEW),
    sap_weight_unit: item.GEWEI || '',
    sap_volume: safeNum(item.VOLUM),
    sap_volume_unit: item.VOLEH || '',
    is_closed: false
  }));

  // Process type → order_type eşlemesi
  const processType = mapping.process_type || '';
  let orderType = 'OUTBOUND';
  if (processType.startsWith('GR') || processType === 'INBOUND' || processType === 'RETURN') {
    orderType = 'INBOUND';
  }

  // İdempotent: aynı delivery_no ile aktif iş emri varsa güncelle
  let workOrder = null;
  if (deliveryNo) {
    const filterOpts = tenantId ? { filter: { tenant_id: tenantId } } : {};
    const existing = await workOrderStore.readAll(filterOpts);
    workOrder = existing.find(wo => wo.sap_delivery_no === deliveryNo);
  }

  if (workOrder) {
    // Güncelle
    workOrder = await workOrderStore.update(workOrder.id, {
      sap_delivery_type: deliveryType || workOrder.sap_delivery_type,
      plant_code: plantCode,
      sap_stor_loc: storLoc || workOrder.sap_stor_loc,
      sap_target_plant: targetPlant || workOrder.sap_target_plant,
      sap_target_stor_loc: targetStorLoc || workOrder.sap_target_stor_loc,
      sap_shipping_point: shippingPoint || workOrder.sap_shipping_point,
      sap_vendor_no: vendorNo || workOrder.sap_vendor_no,
      process_type: processType || workOrder.process_type,
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
      process_type: processType,
      status: 'RECEIVED',
      warehouse_code: mapping.warehouse_code || null,
      plant_code: plantCode,
      sap_stor_loc: storLoc,
      sap_target_plant: targetPlant,
      sap_target_stor_loc: targetStorLoc,
      sap_shipping_point: shippingPoint,
      sap_vendor_no: vendorNo,
      correlation_id: job.correlation_id,
      priority: 'MEDIUM',
      received_at: new Date().toISOString(),
      lines: lines,
      sap_raw_payload: original,
      tenant_id: tenantId
    });

    logger.info('Work order created', {
      work_order_id: workOrder.id,
      delivery_no: deliveryNo,
      correlation_id: job.correlation_id,
      order_type: orderType
    });
  }

  // ── Master Data UPSERT (otomatik) ──
  await upsertMasterData(header, items, workOrder.tenant_id);

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
    body: transformed,
    timeout_ms: mapping.timeout_ms
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
    duration_ms: dispatchResult.duration_ms,
    work_order_id: work_order_id,
    tenant_id: mapping.tenant_id || null
  });

  if (!dispatchResult.ok) {
    // İş emri durumunu güncelle → entegrasyonda hata var
    await workOrderStore.update(work_order_id, {
      status: 'DISPATCH_FAILED',
      wms_raw_payload: dispatchResult.responseBody
    });

    // throw → retry mekanizması devreye girecek
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

/**
 * Master Data UPSERT — SAP payload'dan malzeme ve iş ortağı bilgilerini çıkarır.
 * Yoksa ekler, varsa last_synced_at günceller.
 */
async function upsertMasterData(header, items, tenantId) {
  try {
    // ── Malzemeler (ITEMS → materials) ──
    for (const item of items) {
      const matnr = item.MATNR || item.material;
      if (!matnr) continue;

      const allMats = await materialStore.readAll({ filter: { tenant_id: tenantId } });
      const existing = allMats.find(m => m.sap_material_no === matnr);

      if (existing) {
        await materialStore.update(existing.id, { last_synced_at: new Date().toISOString() });
      } else {
        await materialStore.create({
          sap_material_no: matnr,
          description: item.MAKTX || item.description || '',
          base_uom: item.VRKME || item.uom || 'EA',
          gross_weight: safeNum(item.BRGEW),
          weight_unit: item.GEWEI || '',
          material_group: item.MATKL || '',
          tenant_id: tenantId,
          last_synced_at: new Date().toISOString()
        });
      }
    }

    // ── Müşteri (KUNNR → business_partners) ──
    const kunnr = header.KUNNR;
    if (kunnr) {
      const allPartners = await partnerStore.readAll({ filter: { tenant_id: tenantId } });
      const existingCust = allPartners.find(p => p.sap_partner_no === kunnr && p.partner_type === 'CUSTOMER');

      if (existingCust) {
        await partnerStore.update(existingCust.id, { last_synced_at: new Date().toISOString() });
      } else {
        await partnerStore.create({
          sap_partner_no: kunnr,
          partner_type: 'CUSTOMER',
          name: header.NAME1 || '',
          city: header.ORT01 || '',
          country: header.LAND1 || 'TR',
          tenant_id: tenantId,
          last_synced_at: new Date().toISOString()
        });
      }
    }

    // ── Satıcı (LIFNR → business_partners) ──
    const lifnr = header.LIFNR;
    if (lifnr) {
      const allPartners = await partnerStore.readAll({ filter: { tenant_id: tenantId } });
      const existingVend = allPartners.find(p => p.sap_partner_no === lifnr && p.partner_type === 'VENDOR');

      if (existingVend) {
        await partnerStore.update(existingVend.id, { last_synced_at: new Date().toISOString() });
      } else {
        await partnerStore.create({
          sap_partner_no: lifnr,
          partner_type: 'VENDOR',
          name: header.NAME1 || '',
          city: header.ORT01 || '',
          country: header.LAND1 || 'TR',
          tenant_id: tenantId,
          last_synced_at: new Date().toISOString()
        });
      }
    }
  } catch (err) {
    // Master data UPSERT hatası iş emri oluşturmayı engellememeli
    logger.error('Master data UPSERT error', { error: err.message });
  }
}

module.exports = {
  CREATE_WORK_ORDER: handleCreateWorkOrder,
  DISPATCH_TO_3PL: handleDispatchTo3PL
};
