const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');
const logger = require('../../shared/utils/logger');
const { tenantFilter } = require('../../shared/middleware/auth');

const woStore = new DbStore('work_orders');
const txStore = new DbStore('transaction_logs');

function tf(req) { return tenantFilter(req); }

// GET /api/dashboard/kpis - Compute KPIs from data
router.get('/kpis', async (req, res) => {
  try {
    const orders = await woStore.readAll({ filter: tf(req) });
    const txs = await txStore.readAll({ filter: tf(req) });

    const today = new Date().toISOString().slice(0, 10);

    const totalOrders = orders.length;
    const inProgress = orders.filter(o =>
      ['IN_PROGRESS', 'SENT_TO_WMS', 'PICKING_COMPLETE', 'PARTIALLY_DONE'].includes(o.status)
    ).length;
    const completedToday = orders.filter(o =>
      o.status === 'COMPLETED' && o.completed_at && o.completed_at.toISOString
        ? o.completed_at.toISOString().slice(0, 10) === today
        : String(o.completed_at).slice(0, 10) === today
    ).length;
    const failedCount = orders.filter(o => o.status === 'FAILED').length;
    const todayIngest = orders.filter(o =>
      o.received_at && (o.received_at.toISOString
        ? o.received_at.toISOString().slice(0, 10) === today
        : String(o.received_at).slice(0, 10) === today)
    ).length;
    const pendingSAP = orders.filter(o =>
      ['RECEIVED', 'SENT_TO_WMS', 'IN_PROGRESS', 'PICKING_COMPLETE'].includes(o.status)
    ).length;
    const dlqCount = txs.filter(t => t.status === 'DEAD').length;

    // Average latency from successful transactions
    const successTx = txs.filter(t => t.status === 'SUCCESS' && t.duration_ms);
    const avgLatency = successTx.length > 0
      ? Math.round(successTx.reduce((sum, t) => sum + t.duration_ms, 0) / successTx.length)
      : 0;

    res.json({
      totalOrders,
      inProgress,
      completedToday,
      failedCount,
      todayIngest,
      pendingSAP,
      dlqCount,
      avgLatency
    });
  } catch (err) {
    logger.error('GET /api/dashboard/kpis error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
