const express = require('express');
const router = express.Router();
const JsonStore = require('../../shared/jsonStore');

const store = new JsonStore('transactions.json');
const woStore = new JsonStore('work_orders.json');

// GET /api/transactions - List transactions with filtering
router.get('/', (req, res) => {
  const { status, work_order_id, action_like, limit = 100 } = req.query;
  let data = store.readAll();

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
  const orders = woStore.readAll();
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

module.exports = router;
