const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');

const store = new DbStore('transaction_logs');
const woStore = new DbStore('work_orders');

// GET /api/transactions - List transactions with filtering
router.get('/', async (req, res) => {
  const { status, work_order_id, action_like, limit = 100 } = req.query;
  let data = await store.readAll();

  if (status) {
    data = data.filter(t => t.status === status);
  }
  if (work_order_id) {
    data = data.filter(t => t.work_order_id === work_order_id);
  }
  if (action_like) {
    data = data.filter(t => t.action && t.action.indexOf(action_like) !== -1);
  }

  // Enrich with delivery_no from work orders
  const orders = await woStore.readAll();
  const orderMap = {};
  orders.forEach(o => { orderMap[o.id] = o; });
  data = data.map(t => {
    if (t.work_order_id && orderMap[t.work_order_id]) {
      t.delivery_no = orderMap[t.work_order_id].sap_delivery_no;
    }
    return t;
  });

  // Sort by started_at desc
  data.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  data = data.slice(0, Number(limit));

  res.json({ data, count: data.length });
});

// GET /api/transactions/:id/chain - Get linked transactions by correlation_id
router.get('/:id/chain', async (req, res) => {
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
});

// POST /api/transactions - Create a transaction log entry
router.post('/', async (req, res) => {
  const item = await store.create(req.body);
  res.status(201).json({ data: item });
});

module.exports = router;
