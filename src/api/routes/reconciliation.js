const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');
const logger = require('../../shared/utils/logger');

const store = new DbStore('reconciliation_reports');

// GET /api/reconciliation - List reconciliation reports
router.get('/', async (req, res) => {
  try {
    const data = await store.readAll();
    data.sort((a, b) => new Date(b.run_date) - new Date(a.run_date));
    res.json({ data, count: data.length });
  } catch (err) {
    logger.error('GET /api/reconciliation error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
