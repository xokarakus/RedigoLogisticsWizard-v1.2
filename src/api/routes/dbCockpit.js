const express = require('express');
const router = express.Router();
const { query, getClient } = require('../../shared/database/pool');
const { requireSuperAdmin } = require('../../shared/middleware/auth');
const { logAudit } = require('../../shared/middleware/auditLog');
const logger = require('../../shared/utils/logger');
const { validate } = require('../../shared/validators/middleware');
const { DbCockpitQuerySchema } = require('../../shared/validators/workOrder.schemas');

// Tum endpoint'ler super admin gerektirir
router.use(requireSuperAdmin);

const ALLOWED_TABLES = [
  'tenants', 'users', 'roles', 'role_permissions', 'audit_logs',
  'system_settings', 'work_orders', 'work_order_lines', 'transaction_logs',
  'warehouses', 'process_types', 'process_configs', 'field_mappings',
  'security_profiles', 'movement_mappings', 'sap_field_aliases',
  'materials', 'business_partners', 'job_queue', 'scheduled_jobs',
  'job_executions', 'job_execution_items', 'reconciliation_reports',
  'refresh_tokens', 'schema_migrations'
];

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 500;
const QUERY_RESULT_MAX = 1000;

const FORBIDDEN_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
  'TRUNCATE', 'GRANT', 'REVOKE', 'COPY', 'EXECUTE', 'CALL'
];

/* ═══════════════════════════════════════════
   GET /tables — Tablo listesi + satir sayilari
   ═══════════════════════════════════════════ */
router.get('/tables', async (req, res) => {
  try {
    const result = await query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    );
    const tables = result.rows
      .filter(r => ALLOWED_TABLES.includes(r.tablename))
      .map(r => r.tablename);

    // Satir sayilarini tek sorguda al
    const countParts = tables.map(t => `SELECT '${t}' AS name, count(*)::int AS row_count FROM "${t}"`);
    const countResult = await query(countParts.join(' UNION ALL ') + ' ORDER BY name');

    res.json({ data: countResult.rows });
  } catch (err) {
    logger.error('GET /db-cockpit/tables error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   GET /tables/:name/schema — Sutun tanimlari
   ═══════════════════════════════════════════ */
router.get('/tables/:name/schema', async (req, res) => {
  const tableName = req.params.name;
  if (!ALLOWED_TABLES.includes(tableName)) {
    return res.status(400).json({ error: 'Gecersiz tablo: ' + tableName });
  }

  try {
    // Sutunlar
    const colResult = await query(
      `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName]
    );

    // FK iliskileri
    const fkResult = await query(
      `SELECT
         tc.constraint_name,
         tc.constraint_type,
         kcu.column_name,
         ccu.table_name AS ref_table,
         ccu.column_name AS ref_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       LEFT JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
       WHERE tc.table_schema = 'public' AND tc.table_name = $1
       ORDER BY tc.constraint_type, kcu.column_name`,
      [tableName]
    );

    res.json({
      table: tableName,
      columns: colResult.rows,
      constraints: fkResult.rows
    });
  } catch (err) {
    logger.error('GET /db-cockpit/tables/:name/schema error', { error: err.message, table: tableName });
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   GET /tables/:name/data — Sayfali tablo verisi
   ═══════════════════════════════════════════ */
router.get('/tables/:name/data', async (req, res) => {
  const tableName = req.params.name;
  if (!ALLOWED_TABLES.includes(tableName)) {
    return res.status(400).json({ error: 'Gecersiz tablo: ' + tableName });
  }

  try {
    let limit = Math.min(parseInt(req.query.limit) || PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX);
    let offset = parseInt(req.query.offset) || 0;
    const sortCol = req.query.sort || 'created_at';
    const sortDir = (req.query.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Sutun ismi dogrulama (SQL injection onlemi)
    const colCheck = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );
    const validColumns = colCheck.rows.map(r => r.column_name);
    const actualSort = validColumns.includes(sortCol) ? sortCol : (validColumns.includes('created_at') ? 'created_at' : validColumns[0]);

    // Toplam sayfa
    const countResult = await query(`SELECT count(*)::int AS total FROM "${tableName}"`);
    const total = countResult.rows[0].total;

    // Veri
    const dataResult = await query(
      `SELECT * FROM "${tableName}" ORDER BY "${actualSort}" ${sortDir} LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      data: dataResult.rows,
      fields: dataResult.fields ? dataResult.fields.map(f => f.name) : [],
      total,
      limit,
      offset
    });
  } catch (err) {
    logger.error('GET /db-cockpit/tables/:name/data error', { error: err.message, table: tableName });
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   POST /query — Custom SELECT sorgusu
   ═══════════════════════════════════════════ */
router.post('/query', validate(DbCockpitQuerySchema), async (req, res) => {
  const { sql } = req.body;

  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();

  // SELECT veya WITH ile baslamali
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    return res.status(400).json({ error: 'Sadece SELECT sorgularina izin verilir' });
  }

  // Yasakli keyword kontrolu
  for (const kw of FORBIDDEN_KEYWORDS) {
    // Kelime sinirlarinda kontrol (ornegin "SELECTED"'i yakalamaz)
    const regex = new RegExp('\\b' + kw + '\\b', 'i');
    if (regex.test(trimmed)) {
      return res.status(400).json({ error: kw + ' ifadesine izin verilmez' });
    }
  }

  // Birden fazla statement engelle
  const withoutStrings = trimmed.replace(/'[^']*'/g, '');
  if (withoutStrings.includes(';') && withoutStrings.indexOf(';') < withoutStrings.length - 1) {
    return res.status(400).json({ error: 'Birden fazla SQL ifadesine izin verilmez' });
  }

  // LIMIT yoksa ekle
  let execSql = trimmed.replace(/;$/, '');
  if (!/\bLIMIT\b/i.test(execSql)) {
    execSql += ' LIMIT ' + QUERY_RESULT_MAX;
  }

  const client = await getClient();
  const startTime = Date.now();

  try {
    // READ ONLY transaction
    await client.query('BEGIN READ ONLY');
    const result = await client.query(execSql);
    await client.query('ROLLBACK');

    const executionTime = Date.now() - startTime;

    // Audit log
    logAudit(req, 'db_cockpit', null, 'QUERY', null, { sql: trimmed, rows: result.rowCount, executionTime });

    res.json({
      data: result.rows,
      fields: result.fields ? result.fields.map(f => f.name) : [],
      rowCount: result.rowCount,
      executionTime
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logAudit(req, 'db_cockpit', null, 'QUERY_ERROR', null, { sql: trimmed, error: err.message });
    res.status(400).json({ error: 'Sorgu hatasi: ' + err.message });
  } finally {
    client.release();
  }
});

/* ═══════════════════════════════════════════
   GET /relationships — FK iliskileri
   ═══════════════════════════════════════════ */
router.get('/relationships', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         kcu.table_name AS source_table,
         kcu.column_name AS source_column,
         ccu.table_name AS target_table,
         ccu.column_name AS target_column,
         tc.constraint_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
       ORDER BY kcu.table_name, kcu.column_name`
    );

    res.json({ data: result.rows });
  } catch (err) {
    logger.error('GET /db-cockpit/relationships error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
