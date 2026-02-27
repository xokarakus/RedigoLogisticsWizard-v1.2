/**
 * pgQueue — PostgreSQL SKIP LOCKED Job Queue
 *
 * Redis/BullMQ yerine PostgreSQL'in SELECT ... FOR UPDATE SKIP LOCKED
 * mekanizmasını kullanır. BTP'de ekstra servis gerektirmez.
 *
 * Kullanım:
 *   const pgQueue = require('./shared/queue/pgQueue');
 *   await pgQueue.enqueue('CREATE_WORK_ORDER', correlationId, payload);
 *   pgQueue.startWorker({ CREATE_WORK_ORDER: handler, DISPATCH_TO_3PL: handler });
 */

const { pool } = require('../database/pool');
const logger = require('../utils/logger');
const os = require('os');

const WORKER_ID = os.hostname() + ':' + process.pid;
const POLL_INTERVAL_MS = 1000;         // 1 saniye
const STALE_LOCK_MINUTES = 5;          // 5 dk'dan uzun kilitli → serbest bırak
const MAX_BACKOFF_MS = 30 * 60 * 1000; // 30 dakika

let _handlers = {};
let _polling = false;
let _pollTimer = null;

/**
 * İşi kuyruğa ekle
 * @param {string} jobType — CREATE_WORK_ORDER, DISPATCH_TO_3PL
 * @param {string} correlationId — UUID
 * @param {Object} payload — İş verisi
 * @param {Object} [opts] — { delivery_no, max_attempts, run_after }
 * @returns {Object} Oluşturulan iş kaydı
 */
async function enqueue(jobType, correlationId, payload, opts = {}) {
  const { rows } = await pool.query(
    `INSERT INTO job_queue (job_type, correlation_id, payload, delivery_no, max_attempts, run_after)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING *`,
    [
      jobType,
      correlationId,
      JSON.stringify(payload),
      opts.delivery_no || null,
      opts.max_attempts || 5,
      opts.run_after || new Date()
    ]
  );

  logger.info('Job enqueued', {
    job_id: rows[0].id,
    job_type: jobType,
    correlation_id: correlationId,
    delivery_no: opts.delivery_no
  });

  return rows[0];
}

/**
 * Bir sonraki PENDING işi al ve işle (SKIP LOCKED)
 */
async function pollAndProcess() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Önce stale lock'ları temizle
    await client.query(
      `UPDATE job_queue
       SET status = 'PENDING', locked_at = NULL, locked_by = NULL
       WHERE status = 'PROCESSING'
         AND locked_at < now() - interval '${STALE_LOCK_MINUTES} minutes'`
    );

    // SKIP LOCKED ile bir iş al
    const { rows } = await client.query(
      `SELECT * FROM job_queue
       WHERE status = 'PENDING' AND run_after <= now()
       ORDER BY run_after ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
    );

    if (rows.length === 0) {
      await client.query('COMMIT');
      return false; // İş yok
    }

    const job = rows[0];

    // Kilitle
    await client.query(
      `UPDATE job_queue
       SET status = 'PROCESSING', locked_at = now(), locked_by = $1,
           attempts = attempts + 1, started_at = COALESCE(started_at, now())
       WHERE id = $2`,
      [WORKER_ID, job.id]
    );

    await client.query('COMMIT');

    // Handler'ı çağır
    const handler = _handlers[job.job_type];
    if (!handler) {
      logger.error('No handler for job type', { job_type: job.job_type, job_id: job.id });
      await markFailed(job, 'No handler registered for: ' + job.job_type);
      return true;
    }

    try {
      logger.info('Processing job', {
        job_id: job.id,
        job_type: job.job_type,
        correlation_id: job.correlation_id,
        attempt: job.attempts + 1
      });

      const result = await handler(job);

      // Başarılı
      await pool.query(
        `UPDATE job_queue
         SET status = 'COMPLETED', result = $1::jsonb, completed_at = now(),
             locked_at = NULL, locked_by = NULL
         WHERE id = $2`,
        [JSON.stringify(result || {}), job.id]
      );

      logger.info('Job completed', {
        job_id: job.id,
        job_type: job.job_type,
        correlation_id: job.correlation_id
      });

    } catch (err) {
      logger.error('Job failed', {
        job_id: job.id,
        job_type: job.job_type,
        correlation_id: job.correlation_id,
        attempt: job.attempts + 1,
        error: err.message
      });

      await markFailed(job, err.message);
    }

    return true; // İş işlendi

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Queue poll error', { error: err.message });
    return false;
  } finally {
    client.release();
  }
}

/**
 * Başarısız işi retry veya dead-letter'a taşı
 */
async function markFailed(job, errorMessage) {
  const newAttempts = (job.attempts || 0) + 1;

  if (newAttempts >= (job.max_attempts || 5)) {
    // Dead Letter Queue
    await pool.query(
      `UPDATE job_queue
       SET status = 'DEAD', last_error = $1, completed_at = now(),
           locked_at = NULL, locked_by = NULL
       WHERE id = $2`,
      [errorMessage, job.id]
    );

    logger.warn('Job moved to DLQ', {
      job_id: job.id,
      job_type: job.job_type,
      correlation_id: job.correlation_id,
      attempts: newAttempts
    });
  } else {
    // Exponential backoff: 5s, 20s, 80s, 320s, ...
    const backoffMs = Math.min(5000 * Math.pow(4, newAttempts - 1), MAX_BACKOFF_MS);
    const runAfter = new Date(Date.now() + backoffMs);

    await pool.query(
      `UPDATE job_queue
       SET status = 'PENDING', last_error = $1, run_after = $2,
           locked_at = NULL, locked_by = NULL
       WHERE id = $3`,
      [errorMessage, runAfter, job.id]
    );

    logger.info('Job scheduled for retry', {
      job_id: job.id,
      job_type: job.job_type,
      attempt: newAttempts,
      next_run: runAfter.toISOString(),
      backoff_ms: backoffMs
    });
  }
}

/**
 * Worker döngüsünü başlat
 * @param {Object} handlers — { JOB_TYPE: async (job) => result }
 */
function startWorker(handlers) {
  _handlers = handlers;
  _polling = true;

  logger.info('Queue worker started', {
    worker_id: WORKER_ID,
    job_types: Object.keys(handlers),
    poll_interval_ms: POLL_INTERVAL_MS
  });

  async function tick() {
    if (!_polling) return;

    try {
      const processed = await pollAndProcess();
      // İş varsa hemen tekrar kontrol et, yoksa interval bekle
      if (processed && _polling) {
        setImmediate(tick);
      } else if (_polling) {
        _pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    } catch (err) {
      logger.error('Worker tick error', { error: err.message });
      if (_polling) {
        _pollTimer = setTimeout(tick, POLL_INTERVAL_MS * 3);
      }
    }
  }

  tick();
}

/**
 * Worker'ı durdur
 */
function stopWorker() {
  _polling = false;
  if (_pollTimer) {
    clearTimeout(_pollTimer);
    _pollTimer = null;
  }
  logger.info('Queue worker stopped', { worker_id: WORKER_ID });
}

/**
 * Kuyruk istatistikleri
 */
async function getStats() {
  const { rows } = await pool.query(
    `SELECT status, COUNT(*) as count
     FROM job_queue
     GROUP BY status`
  );

  const stats = { pending: 0, processing: 0, completed: 0, failed: 0, dead: 0 };
  rows.forEach(r => {
    stats[r.status.toLowerCase()] = parseInt(r.count, 10);
  });
  stats.total = Object.values(stats).reduce((a, b) => a + b, 0);

  return stats;
}

/**
 * İş listesi (filtrelenebilir)
 */
async function getJobs(filters = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filters.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.correlation_id) {
    conditions.push(`correlation_id = $${idx++}`);
    params.push(filters.correlation_id);
  }
  if (filters.job_type) {
    conditions.push(`job_type = $${idx++}`);
    params.push(filters.job_type);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const { rows } = await pool.query(
    `SELECT * FROM job_queue ${where}
     ORDER BY created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return rows;
}

/**
 * Dead iş yeniden kuyruğa al
 */
async function retryJob(jobId) {
  const { rows } = await pool.query(
    `UPDATE job_queue
     SET status = 'PENDING', attempts = 0, last_error = NULL,
         run_after = now(), locked_at = NULL, locked_by = NULL,
         completed_at = NULL
     WHERE id = $1 AND status = 'DEAD'
     RETURNING *`,
    [jobId]
  );

  if (rows.length === 0) {
    return null;
  }

  logger.info('Job retried from DLQ', { job_id: jobId, job_type: rows[0].job_type });
  return rows[0];
}

module.exports = {
  enqueue,
  startWorker,
  stopWorker,
  getStats,
  getJobs,
  retryJob
};
