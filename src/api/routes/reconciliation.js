const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');
const logger = require('../../shared/utils/logger');
const { tenantFilter, requireRole } = require('../../shared/middleware/auth');
const jobScheduler = require('../../shared/services/jobScheduler');

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

// POST /api/reconciliation/trigger - Manual reconciliation
router.post('/trigger', requireRole('TENANT_ADMIN'), async (req, res) => {
  try {
    const virtualJob = {
      id: 'manual-recon-' + Date.now(),
      tenant_id: req.tenantId || null,
      job_type: 'RECONCILIATION',
      name: 'Manual Reconciliation',
      config: req.body.config || {},
      schedule_type: 'MANUAL'
    };
    const result = await jobScheduler.executeJob(virtualJob, 'MANUAL');
    res.json({ data: result });
  } catch (err) {
    logger.error('POST /reconciliation/trigger error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
