const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');

const store = new DbStore('work_orders');
const pcStore = new DbStore('process_configs');
const ptStore = new DbStore('process_types');

// Build lookup key from work order fields
function configKey(plantCode, warehouseCode, deliveryType) {
  return plantCode + '|' + warehouseCode + '|' + deliveryType;
}

// GET /api/work-orders - List work orders
router.get('/', async (req, res) => {
  const { status, type, limit = 50, offset = 0 } = req.query;
  let data = await store.readAll();

  if (status) {
    data = data.filter(o => o.status === status);
  }
  if (type) {
    data = data.filter(o => o.order_type === type);
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
    return o;
  });

  // Sort by received_at desc
  data.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));

  const total = data.length;
  data = data.slice(Number(offset), Number(offset) + Number(limit));

  res.json({ data, count: total });
});

// GET /api/work-orders/:id - Single work order
router.get('/:id', async (req, res) => {
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

  res.json({ data: item });
});

// POST /api/work-orders/ingest - Ingest delivery
router.post('/ingest', async (req, res) => {
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
});

module.exports = router;
