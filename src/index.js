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

const app = express();

// Redis/BullMQ bağlantı hatalarının process'i çökertmesini engelle
process.on('unhandledRejection', (reason) => {
  if (reason && reason.code === 'ECONNREFUSED') {
    // Redis bağlantı hatası — dev modda normal, sessizce geç
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
  res.json({ status: 'ok', version: '1.2.0', uptime: process.uptime() });
});

// ── Auth route'ları (kendi JWT auth'u var) ──
app.use('/api/auth', require('./api/routes/auth'));

// ── Webhook route'ları (auth yok — harici sistemler çağırır) ──
app.use('/api/wms', require('./api/routes/wmsWebhook'));
app.use('/api/inbound', require('./api/routes/inbound'));

// ── Korumalı API route'ları (JWT + scope) ──
app.use('/api/work-orders', authenticate, require('./api/routes/workOrders'));
app.use('/api/transactions', authenticate, require('./api/routes/transactions'));
app.use('/api/dashboard', authenticate, require('./api/routes/dashboard'));
app.use('/api/reconciliation', authenticate, require('./api/routes/reconciliation'));
app.use('/api/inventory', authenticate, require('./api/routes/inventory'));
app.use('/api/config', authenticate, require('./api/routes/config'));
app.use('/api/trigger', authenticate, require('./api/routes/trigger'));
app.use('/api/goods-movement', authenticate, require('./api/routes/goodsMovement'));
app.use('/api/scheduled-jobs', authenticate, require('./api/routes/scheduledJobs'));

// ── Queue API (kuyruk yönetimi) ──
app.get('/api/queue/stats', authenticate, async (req, res) => {
  try {
    const stats = await pgQueue.getStats();
    res.json(stats);
  } catch (err) {
    logger.error('Queue stats error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/queue/jobs', authenticate, async (req, res) => {
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

app.post('/api/queue/jobs/:id/retry', authenticate, async (req, res) => {
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
  await sapClient.initialize();

  // PostgreSQL Queue Worker başlat
  pgQueue.startWorker(queueHandlers);

  // Scheduled Jobs yükle
  jobScheduler.loadActiveJobs();

  app.listen(config.port, () => {
    logger.info(`Redigo Logistics Cockpit v1.2 running on port ${config.port}`);
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
