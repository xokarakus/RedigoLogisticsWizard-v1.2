const express = require('express');
const router = express.Router();
const { query } = require('../../shared/database/pool');
const logger = require('../../shared/utils/logger');
const { tenantFilter } = require('../../shared/middleware/auth');

function tf(req) { return tenantFilter(req); }

/**
 * Tarih filtresi olustur.
 * ?period=7d|30d|90d|custom&from=ISO&to=ISO
 */
function buildDateClause(req, column, startIdx) {
  const period = req.query.period || '30d';
  if (period === 'custom') {
    const from = req.query.from;
    const to = req.query.to;
    if (from && to) {
      return { clause: `AND ${column} >= $${startIdx} AND ${column} <= $${startIdx + 1}`, params: [from, to], nextIdx: startIdx + 2 };
    }
  }
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  return { clause: `AND ${column} >= NOW() - INTERVAL '${days} days'`, params: [], nextIdx: startIdx };
}

// ══════════════════════════════════════
// SUREC PERFORMANS ANALIZI
// ══════════════════════════════════════

// A1: Siparis Dongu Sureleri
router.get('/cycle-times', async (req, res) => {
  try {
    const filter = tf(req);
    const tenantId = filter.tenant_id || null;
    const params = tenantId ? [tenantId] : [];
    const tenantClause = tenantId ? 'AND tenant_id = $1' : '';
    const dateInfo = buildDateClause(req, 'received_at', params.length + 1);
    params.push(...dateInfo.params);

    const result = await query(`
      SELECT
        COUNT(*) AS total_orders,
        ROUND(AVG(EXTRACT(EPOCH FROM (sent_to_wms_at - received_at)) / 60)::numeric, 1) AS avg_dispatch_min,
        ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - sent_to_wms_at)) / 60)::numeric, 1) AS avg_confirmation_min,
        ROUND(AVG(EXTRACT(EPOCH FROM (sap_posted_at - completed_at)) / 60)::numeric, 1) AS avg_posting_min,
        ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - received_at)) / 60)::numeric, 1) AS avg_total_cycle_min,
        ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - received_at))) / 60)::numeric, 1) AS median_cycle_min,
        ROUND((PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - received_at))) / 60)::numeric, 1) AS p95_cycle_min
      FROM work_orders
      WHERE completed_at IS NOT NULL ${tenantClause} ${dateInfo.clause}
    `, params);

    res.json(result.rows[0] || {});
  } catch (err) {
    logger.error('GET /reports/cycle-times error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// A2: Surec Bazli Basari Oranlari
router.get('/success-rates', async (req, res) => {
  try {
    const filter = tf(req);
    const tenantId = filter.tenant_id || null;
    const params = tenantId ? [tenantId] : [];
    const tenantClause = tenantId ? 'AND tenant_id = $1' : '';
    const dateInfo = buildDateClause(req, 'received_at', params.length + 1);
    params.push(...dateInfo.params);

    const result = await query(`
      SELECT
        COALESCE(process_type, order_type) AS process_type,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status IN ('COMPLETED','PGI_POSTED','GR_POSTED')) AS success,
        COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
        COUNT(*) FILTER (WHERE status IN ('IN_PROGRESS','SENT_TO_WMS','PARTIALLY_DONE','RECEIVED')) AS pending,
        ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('COMPLETED','PGI_POSTED','GR_POSTED')) / NULLIF(COUNT(*), 0), 1) AS success_rate
      FROM work_orders
      WHERE 1=1 ${tenantClause} ${dateInfo.clause}
      GROUP BY COALESCE(process_type, order_type)
      ORDER BY total DESC
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    logger.error('GET /reports/success-rates error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// A3: Darbogaz Analizi
router.get('/bottlenecks', async (req, res) => {
  try {
    const filter = tf(req);
    const tenantId = filter.tenant_id || null;
    const params = tenantId ? [tenantId] : [];
    const tenantClause = tenantId ? 'AND tenant_id = $1' : '';
    const dateInfo = buildDateClause(req, 'received_at', params.length + 1);
    params.push(...dateInfo.params);

    const result = await query(`
      SELECT stage, avg_minutes, max_minutes, sample_count FROM (
        SELECT
          'Sevkiyat (Dispatch)' AS stage, 1 AS sort_order,
          ROUND(AVG(EXTRACT(EPOCH FROM (sent_to_wms_at - received_at)) / 60)::numeric, 1) AS avg_minutes,
          ROUND(MAX(EXTRACT(EPOCH FROM (sent_to_wms_at - received_at)) / 60)::numeric, 1) AS max_minutes,
          COUNT(*) FILTER (WHERE sent_to_wms_at IS NOT NULL) AS sample_count
        FROM work_orders WHERE 1=1 ${tenantClause} ${dateInfo.clause}
        UNION ALL
        SELECT
          '3PL Onay (Confirmation)', 2,
          ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - sent_to_wms_at)) / 60)::numeric, 1),
          ROUND(MAX(EXTRACT(EPOCH FROM (completed_at - sent_to_wms_at)) / 60)::numeric, 1),
          COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND sent_to_wms_at IS NOT NULL)
        FROM work_orders WHERE 1=1 ${tenantClause} ${dateInfo.clause}
        UNION ALL
        SELECT
          'SAP Kayit (Posting)', 3,
          ROUND(AVG(EXTRACT(EPOCH FROM (sap_posted_at - completed_at)) / 60)::numeric, 1),
          ROUND(MAX(EXTRACT(EPOCH FROM (sap_posted_at - completed_at)) / 60)::numeric, 1),
          COUNT(*) FILTER (WHERE sap_posted_at IS NOT NULL AND completed_at IS NOT NULL)
        FROM work_orders WHERE 1=1 ${tenantClause} ${dateInfo.clause}
      ) sub
      ORDER BY avg_minutes DESC NULLS LAST
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    logger.error('GET /reports/bottlenecks error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// A4: En Sik Hata Nedenleri
router.get('/failure-reasons', async (req, res) => {
  try {
    const filter = tf(req);
    const tenantId = filter.tenant_id || null;
    const params = tenantId ? [tenantId] : [];
    const tenantClause = tenantId ? 'AND tenant_id = $1' : '';
    const dateInfo = buildDateClause(req, 'started_at', params.length + 1);
    params.push(...dateInfo.params);

    const result = await query(`
      SELECT
        COALESCE(error_code, 'UNKNOWN') AS error_code,
        LEFT(error_message, 200) AS error_message,
        COUNT(*) AS occurrence_count,
        MAX(started_at) AS last_seen
      FROM transaction_logs
      WHERE status = 'FAILED' ${tenantClause} ${dateInfo.clause}
      GROUP BY COALESCE(error_code, 'UNKNOWN'), LEFT(error_message, 200)
      ORDER BY occurrence_count DESC
      LIMIT 20
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    logger.error('GET /reports/failure-reasons error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════
// DEPO & 3PL PERFORMANS KARSILASTIRMASI
// ══════════════════════════════════════

// B1: Depo Performans Ozeti
router.get('/warehouse-summary', async (req, res) => {
  try {
    const filter = tf(req);
    const tenantId = filter.tenant_id || null;
    const params = tenantId ? [tenantId] : [];
    const tenantClause = tenantId ? 'AND wo.tenant_id = $1' : '';
    const dateInfo = buildDateClause(req, 'wo.received_at', params.length + 1);
    params.push(...dateInfo.params);

    const result = await query(`
      SELECT
        wo.warehouse_code,
        COALESCE(w.name, wo.warehouse_code) AS warehouse_name,
        COALESCE(w.wms_provider, '-') AS wms_provider,
        COUNT(*) AS total_orders,
        COUNT(*) FILTER (WHERE wo.status IN ('COMPLETED','PGI_POSTED','GR_POSTED')) AS completed,
        COUNT(*) FILTER (WHERE wo.status = 'FAILED') AS failed,
        ROUND(100.0 * COUNT(*) FILTER (WHERE wo.status = 'FAILED') / NULLIF(COUNT(*), 0), 1) AS error_rate,
        ROUND(AVG(EXTRACT(EPOCH FROM (wo.completed_at - wo.received_at)) / 60)::numeric, 1) AS avg_cycle_min
      FROM work_orders wo
      LEFT JOIN warehouses w ON w.code = wo.warehouse_code AND w.tenant_id = wo.tenant_id
      WHERE wo.warehouse_code IS NOT NULL ${tenantClause} ${dateInfo.clause}
      GROUP BY wo.warehouse_code, w.name, w.wms_provider
      ORDER BY total_orders DESC
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    logger.error('GET /reports/warehouse-summary error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// B2: SLA Uyum Raporu
router.get('/warehouse-sla', async (req, res) => {
  try {
    const filter = tf(req);
    const tenantId = filter.tenant_id || null;
    const params = tenantId ? [tenantId] : [];
    const tenantClause = tenantId ? 'AND tenant_id = $1' : '';
    const dateInfo = buildDateClause(req, 'received_at', params.length + 1);
    params.push(...dateInfo.params);

    const result = await query(`
      SELECT
        warehouse_code,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND completed_at - received_at <= INTERVAL '24 hours') AS within_24h,
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND completed_at - received_at <= INTERVAL '48 hours') AS within_48h,
        COUNT(*) FILTER (WHERE completed_at IS NULL OR completed_at - received_at > INTERVAL '48 hours') AS overdue,
        ROUND(100.0 * COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND completed_at - received_at <= INTERVAL '24 hours') / NULLIF(COUNT(*), 0), 1) AS sla_24h_pct
      FROM work_orders
      WHERE warehouse_code IS NOT NULL ${tenantClause} ${dateInfo.clause}
      GROUP BY warehouse_code
      ORDER BY sla_24h_pct ASC NULLS LAST
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    logger.error('GET /reports/warehouse-sla error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// B3: Islem Bazli Hata Karsilastirmasi
router.get('/warehouse-transactions', async (req, res) => {
  try {
    const filter = tf(req);
    const tenantId = filter.tenant_id || null;
    const params = tenantId ? [tenantId] : [];
    const tenantClause = tenantId ? 'AND tl.tenant_id = $1' : '';
    const dateInfo = buildDateClause(req, 'tl.started_at', params.length + 1);
    params.push(...dateInfo.params);

    const result = await query(`
      SELECT
        wo.warehouse_code,
        COUNT(tl.id) AS total_transactions,
        ROUND(AVG(tl.duration_ms)::numeric, 0) AS avg_duration_ms,
        COUNT(*) FILTER (WHERE tl.status = 'FAILED') AS failed_transactions,
        ROUND(100.0 * COUNT(*) FILTER (WHERE tl.status = 'FAILED') / NULLIF(COUNT(tl.id), 0), 1) AS tx_error_rate
      FROM transaction_logs tl
      JOIN work_orders wo ON wo.id = tl.work_order_id AND wo.tenant_id = tl.tenant_id
      WHERE wo.warehouse_code IS NOT NULL ${tenantClause} ${dateInfo.clause}
      GROUP BY wo.warehouse_code
      ORDER BY total_transactions DESC
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    logger.error('GET /reports/warehouse-transactions error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
