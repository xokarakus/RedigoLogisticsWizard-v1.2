const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const config = require('./shared/config');
const logger = require('./shared/utils/logger');
const sapClient = require('./shared/sap/client');
const { setupAuth, authenticate, requireScope } = require('./shared/middleware/auth');

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
  app.listen(config.port, () => {
    logger.info(`Redigo Logistics Cockpit v1.2 running on port ${config.port}`);
    logger.info(`Environment: ${config.env}`);
  });
}

start().catch((err) => {
  logger.error('Failed to start', { error: err.message });
  process.exit(1);
});

module.exports = app;
