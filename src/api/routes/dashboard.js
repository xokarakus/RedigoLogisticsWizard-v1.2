const express = require('express');
const router = express.Router();
const { query } = require('../../shared/database/pool');
const logger = require('../../shared/utils/logger');
const { tenantFilter } = require('../../shared/middleware/auth');

function tf(req) { return tenantFilter(req); }

// GET /api/dashboard/kpis - Compute KPIs with SQL aggregation (no full table scan)
router.get('/kpis', async (req, res) => {
  try {
    const filter = tf(req);
    const tenantId = filter.tenant_id || null;
    const tenantClause = tenantId ? 'AND tenant_id = $1' : '';
    const params = tenantId ? [tenantId] : [];

    // Work order KPIs — single aggregate query
    const woResult = await query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status IN ('IN_PROGRESS','SENT_TO_WMS','PICKING_COMPLETE','PARTIALLY_DONE')) AS in_progress,
        COUNT(*) FILTER (WHERE status = 'COMPLETED' AND completed_at::date = CURRENT_DATE) AS completed_today,
        COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
        COUNT(*) FILTER (WHERE received_at::date = CURRENT_DATE) AS today_ingest,
        COUNT(*) FILTER (WHERE status IN ('RECEIVED','SENT_TO_WMS','IN_PROGRESS','PICKING_COMPLETE')) AS pending_sap
      FROM work_orders WHERE 1=1 ${tenantClause}
    `, params);

    // Transaction KPIs — single aggregate query
    const txResult = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'DEAD') AS dlq_count,
        COALESCE(AVG(duration_ms) FILTER (WHERE status = 'SUCCESS' AND duration_ms IS NOT NULL), 0)::int AS avg_latency
      FROM transaction_logs WHERE 1=1 ${tenantClause}
    `, params);

    const wo = woResult.rows[0];
    const tx = txResult.rows[0];

    res.json({
      totalOrders: Number(wo.total),
      inProgress: Number(wo.in_progress),
      completedToday: Number(wo.completed_today),
      failedCount: Number(wo.failed),
      todayIngest: Number(wo.today_ingest),
      pendingSAP: Number(wo.pending_sap),
      dlqCount: Number(tx.dlq_count),
      avgLatency: Number(tx.avg_latency)
    });
  } catch (err) {
    logger.error('GET /api/dashboard/kpis error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
