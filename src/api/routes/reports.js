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
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ══════════════════════════════════════
// TREND ANALIZI
// ══════════════════════════════════════

// T1: Gunluk Siparis Trendi
router.get('/trend/orders', async (req, res) => {
  try {
    const filter = tf(req);
    const tenantId = filter.tenant_id || null;
    const params = tenantId ? [tenantId] : [];
    const tenantClause = tenantId ? 'AND tenant_id = $1' : '';
    const dateInfo = buildDateClause(req, 'received_at', params.length + 1);
    params.push(...dateInfo.params);

    const result = await query(`
      SELECT
        date_trunc('day', received_at)::date AS day,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status IN ('COMPLETED','PGI_POSTED','GR_POSTED')) AS completed,
        COUNT(*) FILTER (WHERE status = 'FAILED') AS failed
      FROM work_orders
      WHERE 1=1 ${tenantClause} ${dateInfo.clause}
      GROUP BY date_trunc('day', received_at)::date
      ORDER BY day
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    logger.error('GET /reports/trend/orders error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// T2: Gunluk Dongu Suresi Trendi
router.get('/trend/cycle-time', async (req, res) => {
  try {
    const filter = tf(req);
    const tenantId = filter.tenant_id || null;
    const params = tenantId ? [tenantId] : [];
    const tenantClause = tenantId ? 'AND tenant_id = $1' : '';
    const dateInfo = buildDateClause(req, 'received_at', params.length + 1);
    params.push(...dateInfo.params);

    const result = await query(`
      SELECT
        date_trunc('day', received_at)::date AS day,
        ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - received_at)) / 60)::numeric, 1) AS avg_cycle_min,
        COUNT(*) AS sample_count
      FROM work_orders
      WHERE completed_at IS NOT NULL ${tenantClause} ${dateInfo.clause}
      GROUP BY date_trunc('day', received_at)::date
      ORDER BY day
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    logger.error('GET /reports/trend/cycle-time error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// T3: Gunluk Transaction Trendi
router.get('/trend/transactions', async (req, res) => {
  try {
    const filter = tf(req);
    const tenantId = filter.tenant_id || null;
    const params = tenantId ? [tenantId] : [];
    const tenantClause = tenantId ? 'AND tenant_id = $1' : '';
    const dateInfo = buildDateClause(req, 'started_at', params.length + 1);
    params.push(...dateInfo.params);

    const result = await query(`
      SELECT
        date_trunc('day', started_at)::date AS day,
        COUNT(*) AS total_tx,
        COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_tx,
        ROUND(AVG(duration_ms)::numeric, 0) AS avg_latency_ms
      FROM transaction_logs
      WHERE 1=1 ${tenantClause} ${dateInfo.clause}
      GROUP BY date_trunc('day', started_at)::date
      ORDER BY day
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    logger.error('GET /reports/trend/transactions error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ══════════════════════════════════════
// DRILL-DOWN DETAY
// ══════════════════════════════════════

// D1: Surec Bazli Siparis Detayi
router.get('/drill/process-orders', async (req, res) => {
  try {
    const processType = req.query.process_type;
    if (!processType) return res.status(400).json({ error: 'process_type required' });

    const filter = tf(req);
    const tenantId = filter.tenant_id || null;
    const params = tenantId ? [tenantId, processType] : [processType];
    const tenantClause = tenantId ? 'AND wo.tenant_id = $1' : '';
    const ptIdx = tenantId ? 2 : 1;
    const dateInfo = buildDateClause(req, 'wo.received_at', ptIdx + 1);
    params.push(...dateInfo.params);

    const result = await query(`
      SELECT wo.id, wo.sap_delivery_no, wo.status, wo.order_type, wo.warehouse_code,
             wo.received_at, wo.completed_at,
             tl_err.error_code, tl_err.error_message
      FROM work_orders wo
      LEFT JOIN LATERAL (
        SELECT error_code, error_message FROM transaction_logs
        WHERE work_order_id = wo.id AND status = 'FAILED'
        ORDER BY started_at DESC LIMIT 1
      ) tl_err ON true
      WHERE COALESCE(wo.process_type, wo.order_type) = $${ptIdx}
        ${tenantClause} ${dateInfo.clause}
      ORDER BY wo.received_at DESC LIMIT 20
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    logger.error('GET /reports/drill/process-orders error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// D2: Depo Bazli Siparis Detayi
router.get('/drill/warehouse-orders', async (req, res) => {
  try {
    const warehouseCode = req.query.warehouse_code;
    if (!warehouseCode) return res.status(400).json({ error: 'warehouse_code required' });

    const filter = tf(req);
    const tenantId = filter.tenant_id || null;
    const params = tenantId ? [tenantId, warehouseCode] : [warehouseCode];
    const tenantClause = tenantId ? 'AND wo.tenant_id = $1' : '';
    const wcIdx = tenantId ? 2 : 1;
    const dateInfo = buildDateClause(req, 'wo.received_at', wcIdx + 1);
    params.push(...dateInfo.params);

    const result = await query(`
      SELECT wo.id, wo.sap_delivery_no, wo.status, wo.order_type, wo.warehouse_code,
             wo.received_at, wo.completed_at,
             tl_err.error_code, tl_err.error_message
      FROM work_orders wo
      LEFT JOIN LATERAL (
        SELECT error_code, error_message FROM transaction_logs
        WHERE work_order_id = wo.id AND status = 'FAILED'
        ORDER BY started_at DESC LIMIT 1
      ) tl_err ON true
      WHERE wo.warehouse_code = $${wcIdx}
        ${tenantClause} ${dateInfo.clause}
      ORDER BY wo.received_at DESC LIMIT 20
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    logger.error('GET /reports/drill/warehouse-orders error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// D3: Hata Kodu Bazli Siparis Detayi
router.get('/drill/error-orders', async (req, res) => {
  try {
    const errorCode = req.query.error_code;
    if (!errorCode) return res.status(400).json({ error: 'error_code required' });

    const filter = tf(req);
    const tenantId = filter.tenant_id || null;
    const params = tenantId ? [tenantId, errorCode] : [errorCode];
    const tenantClause = tenantId ? 'AND tl.tenant_id = $1' : '';
    const ecIdx = tenantId ? 2 : 1;
    const dateInfo = buildDateClause(req, 'tl.started_at', ecIdx + 1);
    params.push(...dateInfo.params);

    const result = await query(`
      SELECT wo.id, wo.sap_delivery_no, wo.status, wo.warehouse_code,
             wo.received_at, wo.completed_at,
             tl.error_code, tl.error_message, tl.started_at AS error_at
      FROM transaction_logs tl
      JOIN work_orders wo ON wo.id = tl.work_order_id
      WHERE tl.status = 'FAILED' AND COALESCE(tl.error_code, 'UNKNOWN') = $${ecIdx}
        ${tenantClause} ${dateInfo.clause}
      ORDER BY tl.started_at DESC LIMIT 20
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    logger.error('GET /reports/drill/error-orders error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ══════════════════════════════════════
// CSV EXPORT
// ══════════════════════════════════════

function toCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h])).join(','));
  }
  return '\uFEFF' + lines.join('\r\n');
}

// Mevcut rapor SQL'lerini yeniden kullanan export map
const REPORT_SQL = {
  'cycle-times': (tc, dc) => ({
    sql: `SELECT COUNT(*) AS total_orders,
      ROUND(AVG(EXTRACT(EPOCH FROM (sent_to_wms_at - received_at))/60)::numeric,1) AS avg_dispatch_min,
      ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - sent_to_wms_at))/60)::numeric,1) AS avg_confirmation_min,
      ROUND(AVG(EXTRACT(EPOCH FROM (sap_posted_at - completed_at))/60)::numeric,1) AS avg_posting_min,
      ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - received_at))/60)::numeric,1) AS avg_total_cycle_min,
      ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - received_at)))/60)::numeric,1) AS median_cycle_min,
      ROUND((PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - received_at)))/60)::numeric,1) AS p95_cycle_min
    FROM work_orders WHERE completed_at IS NOT NULL ${tc} ${dc}`,
    col: 'received_at'
  }),
  'success-rates': (tc, dc) => ({
    sql: `SELECT COALESCE(process_type, order_type) AS process_type, COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status IN ('COMPLETED','PGI_POSTED','GR_POSTED')) AS success,
      COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
      ROUND(100.0*COUNT(*) FILTER (WHERE status IN ('COMPLETED','PGI_POSTED','GR_POSTED'))/NULLIF(COUNT(*),0),1) AS success_rate
    FROM work_orders WHERE 1=1 ${tc} ${dc}
    GROUP BY COALESCE(process_type, order_type) ORDER BY total DESC`,
    col: 'received_at'
  }),
  'bottlenecks': (tc, dc) => ({
    sql: `SELECT stage, avg_minutes, max_minutes, sample_count FROM (
      SELECT 'Sevkiyat (Dispatch)' AS stage, 1 AS sort_order,
        ROUND(AVG(EXTRACT(EPOCH FROM (sent_to_wms_at-received_at))/60)::numeric,1) AS avg_minutes,
        ROUND(MAX(EXTRACT(EPOCH FROM (sent_to_wms_at-received_at))/60)::numeric,1) AS max_minutes,
        COUNT(*) FILTER (WHERE sent_to_wms_at IS NOT NULL) AS sample_count
      FROM work_orders WHERE 1=1 ${tc} ${dc}
      UNION ALL
      SELECT '3PL Onay (Confirmation)', 2,
        ROUND(AVG(EXTRACT(EPOCH FROM (completed_at-sent_to_wms_at))/60)::numeric,1),
        ROUND(MAX(EXTRACT(EPOCH FROM (completed_at-sent_to_wms_at))/60)::numeric,1),
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND sent_to_wms_at IS NOT NULL)
      FROM work_orders WHERE 1=1 ${tc} ${dc}
      UNION ALL
      SELECT 'SAP Kayit (Posting)', 3,
        ROUND(AVG(EXTRACT(EPOCH FROM (sap_posted_at-completed_at))/60)::numeric,1),
        ROUND(MAX(EXTRACT(EPOCH FROM (sap_posted_at-completed_at))/60)::numeric,1),
        COUNT(*) FILTER (WHERE sap_posted_at IS NOT NULL AND completed_at IS NOT NULL)
      FROM work_orders WHERE 1=1 ${tc} ${dc}
    ) sub ORDER BY avg_minutes DESC NULLS LAST`,
    col: 'received_at'
  }),
  'failure-reasons': (tc, dc) => ({
    sql: `SELECT COALESCE(error_code,'UNKNOWN') AS error_code, LEFT(error_message,200) AS error_message,
      COUNT(*) AS occurrence_count, MAX(started_at) AS last_seen
    FROM transaction_logs WHERE status='FAILED' ${tc} ${dc}
    GROUP BY COALESCE(error_code,'UNKNOWN'), LEFT(error_message,200)
    ORDER BY occurrence_count DESC LIMIT 20`,
    col: 'started_at'
  }),
  'warehouse-summary': (tc, dc) => ({
    sql: `SELECT wo.warehouse_code, COALESCE(w.name,wo.warehouse_code) AS warehouse_name,
      COALESCE(w.wms_provider,'-') AS wms_provider, COUNT(*) AS total_orders,
      COUNT(*) FILTER (WHERE wo.status IN ('COMPLETED','PGI_POSTED','GR_POSTED')) AS completed,
      COUNT(*) FILTER (WHERE wo.status='FAILED') AS failed,
      ROUND(100.0*COUNT(*) FILTER (WHERE wo.status='FAILED')/NULLIF(COUNT(*),0),1) AS error_rate,
      ROUND(AVG(EXTRACT(EPOCH FROM (wo.completed_at-wo.received_at))/60)::numeric,1) AS avg_cycle_min
    FROM work_orders wo LEFT JOIN warehouses w ON w.code=wo.warehouse_code AND w.tenant_id=wo.tenant_id
    WHERE wo.warehouse_code IS NOT NULL ${tc.replace('tenant_id','wo.tenant_id')} ${dc.replace('received_at','wo.received_at')}
    GROUP BY wo.warehouse_code, w.name, w.wms_provider ORDER BY total_orders DESC`,
    col: 'wo.received_at'
  }),
  'warehouse-sla': (tc, dc) => ({
    sql: `SELECT warehouse_code, COUNT(*) AS total,
      COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND completed_at-received_at<=INTERVAL '24 hours') AS within_24h,
      COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND completed_at-received_at<=INTERVAL '48 hours') AS within_48h,
      COUNT(*) FILTER (WHERE completed_at IS NULL OR completed_at-received_at>INTERVAL '48 hours') AS overdue,
      ROUND(100.0*COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND completed_at-received_at<=INTERVAL '24 hours')/NULLIF(COUNT(*),0),1) AS sla_24h_pct
    FROM work_orders WHERE warehouse_code IS NOT NULL ${tc} ${dc}
    GROUP BY warehouse_code ORDER BY sla_24h_pct ASC NULLS LAST`,
    col: 'received_at'
  }),
  'warehouse-transactions': (tc, dc) => ({
    sql: `SELECT wo.warehouse_code, COUNT(tl.id) AS total_transactions,
      ROUND(AVG(tl.duration_ms)::numeric,0) AS avg_duration_ms,
      COUNT(*) FILTER (WHERE tl.status='FAILED') AS failed_transactions,
      ROUND(100.0*COUNT(*) FILTER (WHERE tl.status='FAILED')/NULLIF(COUNT(tl.id),0),1) AS tx_error_rate
    FROM transaction_logs tl JOIN work_orders wo ON wo.id=tl.work_order_id AND wo.tenant_id=tl.tenant_id
    WHERE wo.warehouse_code IS NOT NULL ${tc.replace('tenant_id','tl.tenant_id')} ${dc.replace('started_at','tl.started_at')}
    GROUP BY wo.warehouse_code ORDER BY total_transactions DESC`,
    col: 'tl.started_at'
  })
};

router.get('/export/:reportName', async (req, res) => {
  try {
    const reportName = req.params.reportName;
    const sqlBuilder = REPORT_SQL[reportName];
    if (!sqlBuilder) return res.status(400).json({ error: 'Invalid report name' });

    const filter = tf(req);
    const tenantId = filter.tenant_id || null;
    const params = tenantId ? [tenantId] : [];
    const tenantClause = tenantId ? 'AND tenant_id = $1' : '';
    const dateInfo = buildDateClause(req, 'received_at', params.length + 1);
    params.push(...dateInfo.params);

    const config = sqlBuilder(tenantClause, dateInfo.clause);
    const result = await query(config.sql, params);

    const csv = toCsv(result.rows);
    const now = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${reportName}_${now}.csv"`);
    res.send(csv);
  } catch (err) {
    logger.error('GET /reports/export error', { error: err.message, report: req.params.reportName });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
