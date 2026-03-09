const express = require('express');
const router = express.Router();
const { query } = require('../../shared/database/pool');
const logger = require('../../shared/utils/logger');
const { logAudit } = require('../../shared/middleware/auditLog');
const jobScheduler = require('../../shared/services/jobScheduler');

// Tenant filtresi helper
function tf(req) {
  if (req.user && req.user.is_super_admin && !req.user.impersonating) {
    return { tenant_id: null };
  }
  return { tenant_id: req.tenantId };
}

// ── GET /api/scheduled-jobs ── Liste
router.get('/', async (req, res) => {
  try {
    const filter = tf(req);
    const conditions = [];
    const params = [];
    let idx = 1;

    if (filter.tenant_id) {
      conditions.push('sj.tenant_id = $' + idx++);
      params.push(filter.tenant_id);
    }
    if (req.query.job_type) {
      conditions.push('sj.job_type = $' + idx++);
      params.push(req.query.job_type);
    }
    if (req.query.is_active !== undefined) {
      conditions.push('sj.is_active = $' + idx++);
      params.push(req.query.is_active === 'true');
    }
    if (req.query.search) {
      conditions.push('(sj.name ILIKE $' + idx + ' OR sj.description ILIKE $' + idx + ')');
      params.push('%' + req.query.search + '%');
      idx++;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const sql = `
      SELECT sj.*, t.name as tenant_name, t.code as tenant_code
      FROM scheduled_jobs sj
      LEFT JOIN tenants t ON t.id = sj.tenant_id
      ${where}
      ORDER BY sj.is_active DESC, sj.job_class ASC, sj.name ASC
    `;

    const result = await query(sql, params);
    res.json({ data: result.rows, count: result.rows.length });
  } catch (err) {
    logger.error('GET /api/scheduled-jobs error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/scheduled-jobs/:id ── Detay
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT sj.*, t.name as tenant_name FROM scheduled_jobs sj LEFT JOIN tenants t ON t.id = sj.tenant_id WHERE sj.id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/scheduled-jobs/:id/executions ── Çalışma geçmişi
router.get('/:id/executions', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const result = await query(
      'SELECT * FROM job_executions WHERE job_id = $1 ORDER BY started_at DESC LIMIT $2 OFFSET $3',
      [req.params.id, limit, offset]
    );
    const countResult = await query(
      'SELECT COUNT(*) as total FROM job_executions WHERE job_id = $1',
      [req.params.id]
    );
    res.json({
      data: result.rows,
      count: result.rows.length,
      total: Number(countResult.rows[0].total)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/scheduled-jobs ── Oluştur
router.post('/', async (req, res) => {
  try {
    const {
      name, description, job_type, job_class,
      schedule_type, cron_expression, scheduled_at,
      is_active, config
    } = req.body;

    if (!name || !job_type) {
      return res.status(400).json({ error: 'name and job_type are required' });
    }

    const tenantId = tf(req).tenant_id || req.body.tenant_id || req.tenantId;

    // next_run_at hesapla
    let nextRunAt = null;
    if (schedule_type === 'IMMEDIATE') {
      nextRunAt = new Date();
    } else if (schedule_type === 'ONCE' && scheduled_at) {
      nextRunAt = new Date(scheduled_at);
    } else if (schedule_type === 'PERIODIC' && cron_expression) {
      nextRunAt = jobScheduler.getNextCronDate(cron_expression);
    }

    const sql = `
      INSERT INTO scheduled_jobs (tenant_id, name, description, job_type, job_class, schedule_type, cron_expression, scheduled_at, is_active, config, next_run_at, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
      RETURNING *
    `;
    const result = await query(sql, [
      tenantId, name, description || null, job_type,
      job_class || 'B', schedule_type || 'MANUAL',
      cron_expression || null, scheduled_at || null,
      is_active !== false, JSON.stringify(config || {}),
      nextRunAt, req.user ? req.user.username : null
    ]);

    logAudit(req, 'scheduled_job', result.rows[0].id, 'CREATE', null, result.rows[0]);

    // Scheduler'a bildir
    if (result.rows[0].is_active && schedule_type === 'PERIODIC') {
      jobScheduler.scheduleJob(result.rows[0]);
    }

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    logger.error('POST /api/scheduled-jobs error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/scheduled-jobs/:id ── Güncelle
router.put('/:id', async (req, res) => {
  try {
    const oldResult = await query('SELECT * FROM scheduled_jobs WHERE id = $1', [req.params.id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const old = oldResult.rows[0];

    const {
      name, description, job_type, job_class,
      schedule_type, cron_expression, scheduled_at,
      is_active, config
    } = req.body;

    let nextRunAt = old.next_run_at;
    const sType = schedule_type || old.schedule_type;
    if (sType === 'IMMEDIATE') {
      nextRunAt = new Date();
    } else if (sType === 'ONCE' && (scheduled_at || old.scheduled_at)) {
      nextRunAt = new Date(scheduled_at || old.scheduled_at);
    } else if (sType === 'PERIODIC' && (cron_expression || old.cron_expression)) {
      nextRunAt = jobScheduler.getNextCronDate(cron_expression || old.cron_expression);
    } else if (sType === 'MANUAL') {
      nextRunAt = null;
    }

    const sql = `
      UPDATE scheduled_jobs SET
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        job_type = COALESCE($4, job_type),
        job_class = COALESCE($5, job_class),
        schedule_type = COALESCE($6, schedule_type),
        cron_expression = $7,
        scheduled_at = $8,
        is_active = COALESCE($9, is_active),
        config = COALESCE($10::jsonb, config),
        next_run_at = $11,
        updated_at = NOW()
      WHERE id = $1 RETURNING *
    `;
    const result = await query(sql, [
      req.params.id, name, description, job_type,
      job_class, schedule_type,
      cron_expression !== undefined ? cron_expression : old.cron_expression,
      scheduled_at !== undefined ? scheduled_at : old.scheduled_at,
      is_active, config ? JSON.stringify(config) : null,
      nextRunAt
    ]);

    logAudit(req, 'scheduled_job', req.params.id, 'UPDATE', old, result.rows[0]);

    // Scheduler güncelle
    jobScheduler.unscheduleJob(req.params.id);
    if (result.rows[0].is_active && result.rows[0].schedule_type === 'PERIODIC') {
      jobScheduler.scheduleJob(result.rows[0]);
    }

    res.json({ data: result.rows[0] });
  } catch (err) {
    logger.error('PUT /api/scheduled-jobs error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/scheduled-jobs/:id ── Sil
router.delete('/:id', async (req, res) => {
  try {
    const oldResult = await query('SELECT * FROM scheduled_jobs WHERE id = $1', [req.params.id]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    jobScheduler.unscheduleJob(req.params.id);
    await query('DELETE FROM scheduled_jobs WHERE id = $1', [req.params.id]);

    logAudit(req, 'scheduled_job', req.params.id, 'DELETE', oldResult.rows[0], null);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/scheduled-jobs/:id/run ── Manuel çalıştır
router.post('/:id/run', async (req, res) => {
  try {
    const jobResult = await query('SELECT * FROM scheduled_jobs WHERE id = $1', [req.params.id]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const execution = await jobScheduler.executeJob(jobResult.rows[0], 'MANUAL');
    res.json({ data: execution });
  } catch (err) {
    logger.error('POST /api/scheduled-jobs/:id/run error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/scheduled-jobs/:id/toggle ── Aktif/Pasif
router.post('/:id/toggle', async (req, res) => {
  try {
    const result = await query(
      'UPDATE scheduled_jobs SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = result.rows[0];
    if (job.is_active && job.schedule_type === 'PERIODIC') {
      jobScheduler.scheduleJob(job);
    } else {
      jobScheduler.unscheduleJob(job.id);
    }

    logAudit(req, 'scheduled_job', job.id, job.is_active ? 'ACTIVATE' : 'DEACTIVATE', null, { is_active: job.is_active });
    res.json({ data: job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/scheduled-jobs/:id/executions/:execId/items ── Bireysel iş emri sonuçları
router.get('/:id/executions/:execId/items', async (req, res) => {
  try {
    const result = await query(
      `SELECT jei.*, wo.sap_delivery_type, wo.status as wo_status, wo.plant_code
       FROM job_execution_items jei
       LEFT JOIN work_orders wo ON wo.id = jei.work_order_id
       WHERE jei.execution_id = $1
       ORDER BY jei.created_at ASC`,
      [req.params.execId]
    );
    res.json({ data: result.rows, count: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/scheduled-jobs/:id/executions/:execId/retry-failed ── Hatalıları yeniden dene
router.post('/:id/executions/:execId/retry-failed', async (req, res) => {
  try {
    // Hatalı iş emirlerini bul
    const failedItems = await query(
      `SELECT jei.work_order_id, jei.sap_delivery_no
       FROM job_execution_items jei
       WHERE jei.execution_id = $1 AND jei.status = 'FAILED' AND jei.work_order_id IS NOT NULL`,
      [req.params.execId]
    );

    if (failedItems.rows.length === 0) {
      return res.json({ data: { retried: 0, message: 'Hatal\u0131 i\u015f emri bulunamad\u0131' } });
    }

    // Job bilgisini al
    const jobResult = await query('SELECT * FROM scheduled_jobs WHERE id = $1', [req.params.id]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Yeni execution oluştur ve çalıştır
    const execution = await jobScheduler.executeJob(jobResult.rows[0], 'RETRY');

    logAudit(req, 'scheduled_job', req.params.id, 'RETRY_FAILED', {
      original_execution_id: req.params.execId,
      failed_count: failedItems.rows.length
    }, execution);

    res.json({ data: execution });
  } catch (err) {
    logger.error('POST retry-failed error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
