const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');
const logger = require('../../shared/utils/logger');
const { tenantFilter } = require('../../shared/middleware/auth');

const store = new DbStore('reconciliation_reports');

function tf(req) { return tenantFilter(req); }

// GET /api/reconciliation - List reconciliation reports
router.get('/', async (req, res) => {
  try {
    const data = await store.readAll({ filter: tf(req) });
    data.sort((a, b) => new Date(b.run_date) - new Date(a.run_date));
    res.json({ data, count: data.length });
  } catch (err) {
    logger.error('GET /api/reconciliation error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
