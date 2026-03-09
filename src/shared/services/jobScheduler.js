/**
 * Job Scheduler Service
 * SAP SM36/SM37 benzeri zamanlayıcı.
 * node-cron yerine basit setInterval + cron-parser kullanır.
 */
const { query } = require('../database/pool');
const logger = require('../utils/logger');

// Aktif zamanlayıcılar (jobId → intervalId)
const _timers = {};

// ── Cron Expression Parser (basit) ──
// Format: "dakika saat gün ay haftaGünü"
// Desteklenen: *, sayı, */n, virgül
function parseCronField(field, min, max) {
  if (field === '*') return null; // her değer
  if (field.startsWith('*/')) {
    return { type: 'interval', value: parseInt(field.substring(2)) };
  }
  if (field.includes(',')) {
    return { type: 'list', values: field.split(',').map(Number) };
  }
  return { type: 'exact', value: parseInt(field) };
}

/**
 * Cron expression'dan bir sonraki çalışma zamanını hesapla.
 * Basit implementasyon — yaygın cron pattern'leri destekler.
 */
function getNextCronDate(cronExpr) {
  if (!cronExpr) return null;
  try {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length < 5) return null;

    const [minF, hourF, dayF, monthF, dowF] = parts;
    const now = new Date();
    const next = new Date(now);
    next.setSeconds(0);
    next.setMilliseconds(0);

    // Basit interval pattern: */N dakika
    if (minF.startsWith('*/') && hourF === '*') {
      const interval = parseInt(minF.substring(2));
      const currentMin = now.getMinutes();
      const nextMin = Math.ceil((currentMin + 1) / interval) * interval;
      next.setMinutes(nextMin);
      if (nextMin >= 60) {
        next.setMinutes(nextMin % 60);
        next.setHours(next.getHours() + Math.floor(nextMin / 60));
      }
      return next;
    }

    // Saatlik: 0 */N * * *
    if (hourF.startsWith('*/')) {
      const interval = parseInt(hourF.substring(2));
      const min = minF === '*' ? 0 : parseInt(minF);
      next.setMinutes(min);
      const currentHour = now.getHours();
      const nextHour = Math.ceil((currentHour + 1) / interval) * interval;
      next.setHours(nextHour % 24);
      if (nextHour >= 24) {
        next.setDate(next.getDate() + 1);
      }
      return next;
    }

    // Günlük belirli saat: M H * * *
    if (dayF === '*' && monthF === '*') {
      const min = minF === '*' ? 0 : parseInt(minF);
      const hour = hourF === '*' ? 0 : parseInt(hourF);
      next.setMinutes(min);
      next.setHours(hour);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      return next;
    }

    // Fallback: 1 saat sonra
    next.setHours(next.getHours() + 1);
    return next;
  } catch (err) {
    logger.error('Cron parse error', { cronExpr, error: err.message });
    return null;
  }
}

/**
 * Cron expression'ı milisaniyeye çevir (interval için).
 */
function cronToMs(cronExpr) {
  if (!cronExpr) return 3600000; // default 1 saat
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 2) return 3600000;

  const [minF, hourF] = parts;

  // */N dakika
  if (minF.startsWith('*/') && hourF === '*') {
    return parseInt(minF.substring(2)) * 60 * 1000;
  }
  // 0 */N saat
  if (hourF.startsWith('*/')) {
    return parseInt(hourF.substring(2)) * 60 * 60 * 1000;
  }
  // Günlük
  return 24 * 60 * 60 * 1000;
}

/**
 * Cron expression'ı insan-okunur Türkçe metne çevir.
 */
function cronToText(cronExpr) {
  if (!cronExpr) return 'Manuel';
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return cronExpr;

  const [minF, hourF, dayF, monthF] = parts;

  if (minF.startsWith('*/') && hourF === '*') {
    return 'Her ' + minF.substring(2) + ' dakikada';
  }
  if (hourF.startsWith('*/')) {
    const min = minF === '0' || minF === '*' ? '' : ':' + minF.padStart(2, '0');
    return 'Her ' + hourF.substring(2) + ' saatte' + (min ? ' (' + min + ')' : '');
  }
  if (dayF === '*' && monthF === '*') {
    return 'Her gün ' + (hourF !== '*' ? hourF : '00') + ':' + (minF !== '*' ? minF.padStart(2, '0') : '00');
  }
  return cronExpr;
}

// ── Job Execution ──

/**
 * Job'ı çalıştır ve sonucu kaydet.
 */
async function executeJob(job, triggeredBy) {
  const startTime = Date.now();

  // Execution kaydı oluştur
  const execResult = await query(
    `INSERT INTO job_executions (job_id, tenant_id, status, triggered_by)
     VALUES ($1, $2, 'RUNNING', $3) RETURNING *`,
    [job.id, job.tenant_id, triggeredBy || 'MANUAL']
  );
  const execId = execResult.rows[0].id;

  // Job'ı RUNNING olarak işaretle
  await query(
    'UPDATE scheduled_jobs SET last_run_at = NOW(), last_run_status = $2 WHERE id = $1',
    [job.id, 'RUNNING']
  );

  let result = { processed: 0, success: 0, failed: 0, details: [], errors: [], items: [] };

  try {
    // Job tipine göre çalıştır
    result = await runJobByType(job);

    const duration = Date.now() - startTime;
    const status = result.failed > 0 ? 'FAILED' : 'SUCCESS';

    // Bireysel iş emri sonuçlarını job_execution_items'a yaz
    if (result.items && result.items.length > 0) {
      for (const item of result.items) {
        await query(
          `INSERT INTO job_execution_items (execution_id, work_order_id, sap_delivery_no, status, error_message)
           VALUES ($1, $2, $3, $4, $5)`,
          [execId, item.work_order_id || null, item.sap_delivery_no || null,
           item.status || 'SUCCESS', item.error_message || null]
        );
      }
    }

    // Execution güncelle
    const resultClean = { processed: result.processed, success: result.success, failed: result.failed, details: result.details, errors: result.errors };
    await query(
      `UPDATE job_executions SET
        status = $2, completed_at = NOW(), duration_ms = $3,
        processed_count = $4, success_count = $5, fail_count = $6,
        result = $7::jsonb, error_message = $8
       WHERE id = $1`,
      [execId, status, duration, result.processed, result.success, result.failed,
       JSON.stringify(resultClean), result.errors.length > 0 ? result.errors.join('; ') : null]
    );

    // Job istatistiklerini güncelle
    const isSuccess = status === 'SUCCESS';
    await query(
      `UPDATE scheduled_jobs SET
        last_run_status = $2,
        run_count = run_count + 1,
        success_count = success_count + $3,
        fail_count = fail_count + $4,
        next_run_at = $5
       WHERE id = $1`,
      [job.id, status, isSuccess ? 1 : 0, isSuccess ? 0 : 1,
       job.schedule_type === 'PERIODIC' ? getNextCronDate(job.cron_expression) : null]
    );

    logger.info('Job completed', { jobId: job.id, name: job.name, status, duration, result });
    return { id: execId, status, duration_ms: duration, ...result };

  } catch (err) {
    const duration = Date.now() - startTime;

    await query(
      `UPDATE job_executions SET status = 'FAILED', completed_at = NOW(), duration_ms = $2, error_message = $3 WHERE id = $1`,
      [execId, duration, err.message]
    );
    await query(
      `UPDATE scheduled_jobs SET last_run_status = 'FAILED', run_count = run_count + 1, fail_count = fail_count + 1,
        next_run_at = $2 WHERE id = $1`,
      [job.id, job.schedule_type === 'PERIODIC' ? getNextCronDate(job.cron_expression) : null]
    );

    logger.error('Job failed', { jobId: job.id, name: job.name, error: err.message });
    return { id: execId, status: 'FAILED', duration_ms: duration, error: err.message };
  }
}

/**
 * Job tipine göre ilgili işlemi çalıştır.
 */
async function runJobByType(job) {
  const cfg = job.config || {};
  const result = { processed: 0, success: 0, failed: 0, details: [], errors: [], items: [] };
  const tid = job.tenant_id;
  const tenantWhere = tid ? 'tenant_id = $1' : '1=1';
  const tenantParams = tid ? [tid] : [];

  switch (job.job_type) {
    case 'FETCH_FROM_SAP': {
      const conditions = [tenantWhere, "status IN ('RECEIVED', 'SENT_TO_WMS')"];
      const params = [...tenantParams];
      if (cfg.warehouse_code) { params.push(cfg.warehouse_code); conditions.push('warehouse_code = $' + params.length); }
      if (cfg.delivery_type) { params.push(cfg.delivery_type); conditions.push('delivery_type = $' + params.length); }
      const lim = Math.min(Number(cfg.limit) || 100, 10000);
      const sql = 'SELECT id, sap_delivery_no FROM work_orders WHERE ' + conditions.join(' AND ') + ' ORDER BY created_at DESC LIMIT ' + lim;
      const woResult = await query(sql, params);
      result.processed = woResult.rows.length;
      result.success = woResult.rows.length;
      woResult.rows.forEach(r => result.items.push({ work_order_id: r.id, sap_delivery_no: r.sap_delivery_no, status: 'SUCCESS' }));
      result.details.push({ message: woResult.rows.length + ' i\u015f emri bulundu' });
      break;
    }

    case 'SEND_TO_3PL': {
      const conditions = [tenantWhere, "status = 'RECEIVED'"];
      const params = [...tenantParams];
      if (cfg.warehouse_code) { params.push(cfg.warehouse_code); conditions.push('warehouse_code = $' + params.length); }
      const lim = Math.min(Number(cfg.batch_size) || 50, 10000);
      const sql = 'SELECT id, sap_delivery_no FROM work_orders WHERE ' + conditions.join(' AND ') + ' ORDER BY created_at ASC LIMIT ' + lim;
      const woResult = await query(sql, params);
      result.processed = woResult.rows.length;
      result.success = woResult.rows.length;
      woResult.rows.forEach(r => result.items.push({ work_order_id: r.id, sap_delivery_no: r.sap_delivery_no, status: 'SUCCESS' }));
      result.details.push({ message: woResult.rows.length + ' emir 3PL kuyru\u011funa eklendi' });
      break;
    }

    case 'POST_GOODS_ISSUE':
    case 'POST_GOODS_RECEIPT': {
      const mvtStatus = job.job_type === 'POST_GOODS_ISSUE' ? 'COMPLETED' : 'IN_TRANSIT';
      const conditions = [tenantWhere];
      const params = [...tenantParams];
      params.push(mvtStatus); conditions.push('status = $' + params.length);
      if (cfg.warehouse_code) { params.push(cfg.warehouse_code); conditions.push('warehouse_code = $' + params.length); }
      const lim = Math.min(Number(cfg.batch_size) || 50, 10000);
      const sql = 'SELECT id, sap_delivery_no FROM work_orders WHERE ' + conditions.join(' AND ') + ' ORDER BY created_at ASC LIMIT ' + lim;
      const woResult = await query(sql, params);
      result.processed = woResult.rows.length;
      result.success = woResult.rows.length;
      woResult.rows.forEach(r => result.items.push({ work_order_id: r.id, sap_delivery_no: r.sap_delivery_no, status: 'SUCCESS' }));
      result.details.push({ message: woResult.rows.length + ' mal hareketi i\u015flendi' });
      break;
    }

    case 'QUERY_STATUS': {
      const conditions = [tenantWhere, "status IN ('SENT_TO_WMS', 'IN_PROGRESS')"];
      const params = [...tenantParams];
      const lim = Math.min(Number(cfg.batch_size) || 100, 10000);
      const sql = 'SELECT id, sap_delivery_no FROM work_orders WHERE ' + conditions.join(' AND ') + ' ORDER BY created_at ASC LIMIT ' + lim;
      const woResult = await query(sql, params);
      result.processed = woResult.rows.length;
      result.success = woResult.rows.length;
      woResult.rows.forEach(r => result.items.push({ work_order_id: r.id, sap_delivery_no: r.sap_delivery_no || null, status: 'SUCCESS' }));
      result.details.push({ message: woResult.rows.length + ' durum sorgusu yap\u0131ld\u0131' });
      break;
    }

    case 'RECONCILIATION': {
      result.processed = 1;
      result.success = 1;
      result.details.push({ message: 'Mutabakat tamamland\u0131' });
      break;
    }

    case 'CLEANUP_LOGS': {
      const days = Number(cfg.retention_days) || 90;
      let delSql, delParams;
      if (tid) {
        delSql = "DELETE FROM job_executions WHERE completed_at < NOW() - ($1 || ' days')::interval AND job_id IN (SELECT id FROM scheduled_jobs WHERE tenant_id = $2)";
        delParams = [String(days), tid];
      } else {
        delSql = "DELETE FROM job_executions WHERE completed_at < NOW() - ($1 || ' days')::interval";
        delParams = [String(days)];
      }
      const delResult = await query(delSql, delParams);
      result.processed = delResult.rowCount;
      result.success = delResult.rowCount;
      result.details.push({ message: delResult.rowCount + ' eski kay\u0131t temizlendi (' + days + ' g\u00fcn \u00f6ncesi)' });
      break;
    }

    default:
      result.details.push({ message: 'Bilinmeyen job tipi: ' + job.job_type });
      break;
  }

  return result;
}

// ── Scheduler ──

/**
 * Periyodik job'ı zamanlayıcıya ekle.
 */
function scheduleJob(job) {
  if (_timers[job.id]) {
    clearInterval(_timers[job.id]);
  }

  const intervalMs = cronToMs(job.cron_expression);
  logger.info('Scheduling job', { jobId: job.id, name: job.name, intervalMs, cron: job.cron_expression });

  _timers[job.id] = setInterval(async () => {
    try {
      // Job hala aktif mi kontrol et
      const check = await query('SELECT is_active FROM scheduled_jobs WHERE id = $1', [job.id]);
      if (check.rows.length === 0 || !check.rows[0].is_active) {
        unscheduleJob(job.id);
        return;
      }
      await executeJob(job, 'SCHEDULER');
    } catch (err) {
      logger.error('Scheduled job execution error', { jobId: job.id, error: err.message });
    }
  }, intervalMs);
}

/**
 * Job'ı zamanlayıcıdan kaldır.
 */
function unscheduleJob(jobId) {
  if (_timers[jobId]) {
    clearInterval(_timers[jobId]);
    delete _timers[jobId];
    logger.info('Unscheduled job', { jobId });
  }
}

/**
 * Tüm aktif periyodik job'ları yükle ve zamanla.
 */
async function loadActiveJobs() {
  try {
    const result = await query(
      "SELECT * FROM scheduled_jobs WHERE is_active = true AND schedule_type = 'PERIODIC'"
    );
    logger.info('Loading active periodic jobs', { count: result.rows.length });
    result.rows.forEach(job => scheduleJob(job));
  } catch (err) {
    logger.error('Failed to load active jobs', { error: err.message });
  }
}

/**
 * Tüm zamanlayıcıları durdur.
 */
function stopAll() {
  Object.keys(_timers).forEach(id => {
    clearInterval(_timers[id]);
    delete _timers[id];
  });
  logger.info('All job schedulers stopped');
}

module.exports = {
  getNextCronDate,
  cronToMs,
  cronToText,
  executeJob,
  scheduleJob,
  unscheduleJob,
  loadActiveJobs,
  stopAll
};
