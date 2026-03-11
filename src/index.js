const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const config = require('./shared/config');
const logger = require('./shared/utils/logger');
const sapClient = require('./shared/sap/client');
const { setupAuth, authenticate, requireScope } = require('./shared/middleware/auth');
const pgQueue = require('./shared/queue/pgQueue');
const queueHandlers = require('./modules/work-order/services/WorkOrderQueueHandler');
const jobScheduler = require('./shared/services/jobScheduler');
const { runPending } = require('./shared/database/migrate');

const API_VERSION = 'v1';
const APP_VERSION = '1.2.0';

const app = express();

// Redis/BullMQ baglanti hatalarinin process'i cokertmesini engelle
process.on('unhandledRejection', (reason) => {
  if (reason && reason.code === 'ECONNREFUSED') {
    return;
  }
  logger.error('Unhandled rejection', { error: reason && reason.message || String(reason) });
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '5mb' }));

// XSUAA JWT Authentication (BTP'de aktif, local dev'de skip)
setupAuth(app);

// Health check (auth gerekmez)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: APP_VERSION, apiVersion: API_VERSION, uptime: process.uptime() });
});

// ══════════════════════════════════════
// API v1 Router
// ══════════════════════════════════════
const v1 = express.Router();

// Auth (kendi JWT auth'u var)
v1.use('/auth', require('./api/routes/auth'));

// Webhook (auth yok — harici sistemler cagirir)
v1.use('/wms', require('./api/routes/wmsWebhook'));
v1.use('/inbound', require('./api/routes/inbound'));

// Korumali route'lar (JWT + scope)
v1.use('/work-orders', authenticate, require('./api/routes/workOrders'));
v1.use('/transactions', authenticate, require('./api/routes/transactions'));
v1.use('/dashboard', authenticate, require('./api/routes/dashboard'));
v1.use('/reconciliation', authenticate, require('./api/routes/reconciliation'));
v1.use('/inventory', authenticate, require('./api/routes/inventory'));
v1.use('/config', authenticate, require('./api/routes/config'));
v1.use('/trigger', authenticate, require('./api/routes/trigger'));
v1.use('/goods-movement', authenticate, require('./api/routes/goodsMovement'));
v1.use('/scheduled-jobs', authenticate, require('./api/routes/scheduledJobs'));
v1.use('/master-data', authenticate, require('./api/routes/masterData'));

// Queue API
v1.get('/queue/stats', authenticate, async (req, res) => {
  try {
    const stats = await pgQueue.getStats();
    res.json(stats);
  } catch (err) {
    logger.error('Queue stats error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

v1.get('/queue/jobs', authenticate, async (req, res) => {
  try {
    const { status, correlation_id, job_type, limit, offset } = req.query;
    const jobs = await pgQueue.getJobs({
      status, correlation_id, job_type,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0
    });
    res.json({ data: jobs, count: jobs.length });
  } catch (err) {
    logger.error('Queue jobs error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

v1.post('/queue/jobs/:id/retry', authenticate, async (req, res) => {
  try {
    const job = await pgQueue.retryJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found or not in DEAD status' });
    }
    res.json({ message: 'Job re-queued', job });
  } catch (err) {
    logger.error('Queue retry error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Mount v1 router
app.use('/api/v1', v1);

// ══════════════════════════════════════
// Backward Compatibility: /api/* → /api/v1/*
// Mevcut frontend ve entegrasyonlar /api/ kullanmaya devam edebilir.
// Deprecation header ekler.
// ══════════════════════════════════════
app.use('/api', (req, res, next) => {
  res.set('X-API-Deprecated', 'Use /api/v1 instead. This prefix will be removed in v2.0.');
  // Request'i v1 router'a yonlendir
  req.url = req.url; // url ayni kalir, v1 router handle eder
  v1(req, res, next);
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Startup
async function start() {
  // Otomatik migration — bekleyen migration'lari uygula
  try {
    const result = await runPending({ silent: false });
    if (result.applied > 0) {
      logger.info(`${result.applied} migration uygulandı (toplam: ${result.total})`);
    }
  } catch (err) {
    logger.error('Migration hatasi — sunucu baslatilmiyor', { error: err.message });
    process.exit(1);
  }

  await sapClient.initialize();

  // PostgreSQL Queue Worker baslat
  pgQueue.startWorker(queueHandlers);

  // Scheduled Jobs yukle
  jobScheduler.loadActiveJobs();

  app.listen(config.port, () => {
    logger.info(`Redigo Logistics Cockpit v${APP_VERSION} running on port ${config.port}`);
    logger.info(`API: /api/v1 (backward compat: /api)`);
    logger.info(`Environment: ${config.env}`);
  });
}

start().catch((err) => {
  logger.error('Failed to start', { error: err.message });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, stopping workers...');
  pgQueue.stopWorker();
  jobScheduler.stopAll();
  process.exit(0);
});

module.exports = app;
