const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');

const store = new DbStore('reconciliation_reports');

// GET /api/reconciliation - List reconciliation reports
router.get('/', async (req, res) => {
  const data = await store.readAll();
  data.sort((a, b) => new Date(b.run_date) - new Date(a.run_date));
  res.json({ data, count: data.length });
});

module.exports = router;
