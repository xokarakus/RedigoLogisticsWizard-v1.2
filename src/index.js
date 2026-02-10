const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const config = require('./shared/config');
const logger = require('./shared/utils/logger');
const sapClient = require('./shared/sap/client');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '5mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.2.0', uptime: process.uptime() });
});

// API Routes (will be expanded per module)
app.use('/api/work-orders', require('./api/routes/workOrders'));
app.use('/api/wms', require('./api/routes/wmsWebhook'));
app.use('/api/inventory', require('./api/routes/inventory'));

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
