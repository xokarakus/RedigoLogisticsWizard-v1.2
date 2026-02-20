const express = require('express');
const router = express.Router();
const JsonStore = require('../../shared/jsonStore');

const store = new JsonStore('reconciliation.json');

// GET /api/reconciliation - List reconciliation reports
router.get('/', (req, res) => {
  const data = store.readAll();
  data.sort((a, b) => new Date(b.run_date) - new Date(a.run_date));
  res.json({ data, count: data.length });
});

module.exports = router;
