const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');
const logger = require('../../shared/utils/logger');
const { tenantFilter } = require('../../shared/middleware/auth');
const { CLOSED_STATUSES } = require('../../shared/constants/statuses');

const store = new DbStore('work_orders');
const pcStore = new DbStore('process_configs');
const ptStore = new DbStore('process_types');

function tf(req) { return tenantFilter(req); }

// Build lookup key from work order fields
function configKey(plantCode, warehouseCode, deliveryType) {
  return plantCode + '|' + warehouseCode + '|' + deliveryType;
}

// Gecersiz SAP tarihlerini temizle (00000000, null, undefined → '')
function safeSapDate(val) {
  if (!val || val === '00000000' || val === '0000-00-00') return '';
  return val;
}

// Null-safe numeric donusum
function safeNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

// sap_raw_payload.HEADER alanlarini flat property olarak ekle (grid icin)
function flattenHeader(wo) {
  const hdr = wo.sap_raw_payload && wo.sap_raw_payload.HEADER || {};
  wo.sap_customer_name = hdr.NAME1 || '';
  wo.sap_city = hdr.ORT01 || '';
  wo.sap_district = hdr.ORT02 || '';
  wo.sap_street = hdr.STRAS || '';
  wo.sap_phone = hdr.TELF1 || '';
  // DB sütunlarından al, yoksa JSON'dan fallback
  wo.sap_stor_loc = wo.sap_stor_loc || hdr.LGORT || '';
  wo.sap_target_plant = wo.sap_target_plant || hdr.UMWRK || '';
  wo.sap_target_stor_loc = wo.sap_target_stor_loc || hdr.UMLGO || '';
  wo.sap_shipping_point = wo.sap_shipping_point || hdr.VSTEL || '';
  wo.sap_vendor_no = wo.sap_vendor_no || hdr.LIFNR || '';
  wo.sap_goods_date = safeSapDate(hdr.WADAT);
  // Ust seviye tarihleri de temizle
  wo.sap_doc_date = safeSapDate(wo.sap_doc_date);
  // Lines: eski is emirlerinde weight/volume yok ise raw payload'dan zenginlestir
  const rawItems = wo.sap_raw_payload && wo.sap_raw_payload.ITEMS || [];
  if (wo.lines && wo.lines.length > 0) {
    wo.lines.forEach((line, idx) => {
      // Null-safe: agirlik/hacim her zaman sayisal olsun
      line.sap_gross_weight = safeNum(line.sap_gross_weight);
      line.sap_volume = safeNum(line.sap_volume);
      line.sap_weight_unit = line.sap_weight_unit || '';
      line.sap_volume_unit = line.sap_volume_unit || '';
      line.sap_requested_qty = safeNum(line.sap_requested_qty);
      line.wms_picked_qty = safeNum(line.wms_picked_qty);
      // Eski kayitlar icin raw payload'dan zenginlestir
      if (line.sap_gross_weight === 0 && rawItems[idx]) {
        const ri = rawItems[idx];
        line.sap_gross_weight = safeNum(ri.BRGEW);
        line.sap_weight_unit = ri.GEWEI || line.sap_weight_unit;
        line.sap_volume = safeNum(ri.VOLUM);
        line.sap_volume_unit = ri.VOLEH || line.sap_volume_unit;
      }
    });
  }
  return wo;
}

// GET /api/work-orders - List work orders
router.get('/', async (req, res) => {
  try {
    const { status, type, limit = 100, offset = 0, date_from, date_to } = req.query;
    let data = await store.readAll({ filter: tf(req) });

    if (status) {
      data = data.filter(o => o.status === status);
    }
    if (type) {
      data = data.filter(o => o.order_type === type);
    }
    // Tarih aralığı filtresi (received_at)
    if (date_from) {
      const dFrom = new Date(date_from);
      data = data.filter(o => o.received_at && new Date(o.received_at) >= dFrom);
    }
    if (date_to) {
      const dTo = new Date(date_to);
      dTo.setHours(23, 59, 59, 999);
      data = data.filter(o => o.received_at && new Date(o.received_at) <= dTo);
    }

    // process_types tablosundan kod→ad eşleştirmesi
    const processTypes = await ptStore.readAll();
    const ptMap = {};
    processTypes.forEach(pt => { ptMap[pt.code] = pt.name; });

    // Enrich: process_type zaten work_order'da varsa kullan, yoksa process_configs'den bul
    const configs = await pcStore.readAll();
    const configMap = {};
    configs.forEach(c => {
      configMap[configKey(c.plant_code, c.warehouse_code, c.delivery_type)] = c;
    });
    data = data.map(o => {
      if (!o.process_type) {
        const key = configKey(o.plant_code || '1000', o.warehouse_code, o.sap_delivery_type);
        const cfg = configMap[key];
        if (cfg) {
          o.process_type = cfg.process_type;
        }
      }
      // process_type_desc her zaman process_types tablosundan gelsin
      o.process_type_desc = ptMap[o.process_type] || '';
      flattenHeader(o);
      // Listelemede buyuk alanlari gonderme (performans)
      // Shallow copy — DB objesini mutasyona ugratma
      const { lines, sap_raw_payload, wms_raw_payload, ...rest } = o;
      rest.line_count = (lines || []).length;
      return rest;
    });

    // Sort by received_at desc
    data.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));

    const total = data.length;
    // Tarih filtresi varsa limit uygulama (kullanici gecmis veriyi istiyor)
    const bHasDateFilter = !!(date_from || date_to);
    if (!bHasDateFilter) {
      data = data.slice(Number(offset), Number(offset) + Number(limit));
    }

    res.json({ data, count: total });
  } catch (err) {
    logger.error('GET /api/work-orders error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/work-orders/:id - Single work order
router.get('/:id', async (req, res) => {
  try {
    const item = await store.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Kayit bulunamadi' });

    // Enrich: process_type zaten varsa kullan, yoksa process_configs'den bul
    if (!item.process_type) {
      const configs = await pcStore.readAll();
      const key = configKey(item.plant_code || '1000', item.warehouse_code, item.sap_delivery_type);
      const cfg = configs.find(c => configKey(c.plant_code, c.warehouse_code, c.delivery_type) === key);
      if (cfg) {
        item.process_type = cfg.process_type;
      }
    }
    // process_type_desc her zaman process_types tablosundan gelsin
    const processTypes = await ptStore.readAll();
    const pt = processTypes.find(p => p.code === item.process_type);
    item.process_type_desc = pt ? pt.name : '';
    flattenHeader(item);

    // Kalem sayfalama (skip/top)
    const linesSkip = Number(req.query.lines_skip) || 0;
    const linesTop = Math.min(Number(req.query.lines_top) || 100, 500);
    const allLines = item.lines || [];
    const totalLines = allLines.length;
    item.lines = allLines.slice(linesSkip, linesSkip + linesTop);
    item.lines_total = totalLines;
    item.lines_skip = linesSkip;
    item.lines_top = linesTop;
    item.lines_has_more = (linesSkip + linesTop) < totalLines;

    res.json({ data: item });
  } catch (err) {
    logger.error('GET /api/work-orders/:id error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/work-orders/:id - Update work order (kapali durumda engellenir)
router.put('/:id', async (req, res) => {
  try {
    const item = await store.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Kayit bulunamadi' });

    if (CLOSED_STATUSES.includes(item.status)) {
      return res.status(403).json({
        error: 'Bu is emri kapatilmis (' + item.status + '), degistirilemez',
        status: item.status
      });
    }

    // Guncellenmesine izin verilen alanlar
    const allowed = ['priority', 'notes', 'status'];
    const updates = {};
    allowed.forEach(key => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });

    // Status degisikligi: kapaliya gecis kontrolu
    if (updates.status && CLOSED_STATUSES.includes(updates.status) && updates.status !== 'CANCELLED') {
      return res.status(403).json({
        error: 'Bu duruma manuel gecis yapilamaz: ' + updates.status,
        status: item.status
      });
    }

    // CANCELLED yapilirken completed_at set et
    if (updates.status === 'CANCELLED') {
      updates.completed_at = new Date().toISOString();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Guncellenecek alan yok' });
    }

    const updated = await store.update(req.params.id, updates);
    res.json({ data: updated });
  } catch (err) {
    logger.error('PUT /api/work-orders error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/work-orders/ingest - Ingest delivery
router.post('/ingest', async (req, res) => {
  try {
    const payload = req.body;
    const item = await store.create({
      sap_delivery_no: payload.sap_delivery_no,
      sap_delivery_type: payload.sap_delivery_type,
      sap_doc_date: payload.sap_doc_date,
      sap_ship_to: payload.sap_ship_to,
      order_type: payload.order_type,
      warehouse_code: payload.warehouse_code,
      plant_code: payload.plant_code || '1000',
      status: 'RECEIVED',
      priority: payload.priority || 'MEDIUM',
      received_at: new Date().toISOString(),
      sent_to_wms_at: null,
      completed_at: null,
      sap_posted_at: null,
      wms_order_id: null,
      lines: payload.lines || [],
      sap_raw_payload: payload,
      wms_raw_payload: null
    });
    res.status(201).json({ id: item.id, delivery: item.sap_delivery_no, status: 'RECEIVED' });
  } catch (err) {
    logger.error('POST /api/work-orders/ingest error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
