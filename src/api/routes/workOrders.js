const express = require('express');
const router = express.Router();
const JsonStore = require('../../shared/jsonStore');

const store = new JsonStore('work_orders.json');

// GET /api/work-orders - List work orders
router.get('/', (req, res) => {
  const { status, type, limit = 50, offset = 0 } = req.query;
  let data = store.readAll();

  if (status) {
    data = data.filter(o => o.status === status);
  }
  if (type) {
    data = data.filter(o => o.order_type === type);
  }

  // Sort by received_at desc
  data.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));

  const total = data.length;
  data = data.slice(Number(offset), Number(offset) + Number(limit));

  res.json({ data, count: total });
});

// GET /api/work-orders/:id - Single work order
router.get('/:id', (req, res) => {
  const item = store.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ data: item });
});

// POST /api/work-orders/ingest - Ingest delivery
router.post('/ingest', (req, res) => {
  const payload = req.body;
  const item = store.create({
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
