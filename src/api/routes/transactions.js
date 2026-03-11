const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');
const logger = require('../../shared/utils/logger');
const { tenantFilter } = require('../../shared/middleware/auth');

const store = new DbStore('transaction_logs');
const woStore = new DbStore('work_orders');

function tf(req) { return tenantFilter(req); }

// GET /api/transactions - List transactions with filtering
router.get('/', async (req, res) => {
  try {
    const { status, work_order_id, action_like, limit = 100, date_from, date_to } = req.query;
    let data = await store.readAll({ filter: tf(req) });

    if (status) {
      data = data.filter(t => t.status === status);
    }
    if (work_order_id) {
      data = data.filter(t => t.work_order_id === work_order_id);
    }
    if (action_like) {
      data = data.filter(t => t.action && t.action.indexOf(action_like) !== -1);
    }
    if (date_from) {
      const dFrom = new Date(date_from);
      data = data.filter(t => t.started_at && new Date(t.started_at) >= dFrom);
    }
    if (date_to) {
      const dTo = new Date(date_to);
      dTo.setHours(23, 59, 59, 999);
      data = data.filter(t => t.started_at && new Date(t.started_at) <= dTo);
    }

    // Enrich with delivery_no from work orders
    const orders = await woStore.readAll({ filter: tf(req) });
    const orderMap = {};
    orders.forEach(o => { orderMap[o.id] = o; });
    data = data.map(t => {
      if (t.work_order_id && orderMap[t.work_order_id]) {
        t.delivery_no = orderMap[t.work_order_id].sap_delivery_no;
      }
      // Fallback: sap_doc_number varsa delivery_no olarak kullan
      if (!t.delivery_no && t.sap_doc_number) {
        t.delivery_no = t.sap_doc_number;
      }
      return t;
    });

    // Sort by started_at desc
    data.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
    const total = data.length;
    const bHasDateFilter = !!(date_from || date_to);
    if (!bHasDateFilter) {
      data = data.slice(0, Number(limit));
    }

    res.json({ data, count: total });
  } catch (err) {
    logger.error('GET /api/transactions error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions/:id/chain - Get linked transactions by correlation_id
router.get('/:id/chain', async (req, res) => {
  try {
    const all = await store.readAll();
    const tx = all.find(t => t.id === req.params.id);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (!tx.correlation_id) {
      return res.json({ data: [tx], correlation_id: null, count: 1 });
    }
    const chain = all
      .filter(t => t.correlation_id === tx.correlation_id)
      .sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
    res.json({ data: chain, correlation_id: tx.correlation_id, count: chain.length });
  } catch (err) {
    logger.error('GET /api/transactions/:id/chain error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transactions - Create a transaction log entry
router.post('/', async (req, res) => {
  try {
    const item = await store.create(req.body);
    res.status(201).json({ data: item });
  } catch (err) {
    logger.error('POST /api/transactions error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
