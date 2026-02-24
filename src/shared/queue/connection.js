const config = require('../config');
const logger = require('../utils/logger');

let sapQueue = null;
let wmsQueue = null;
let connection = null;

// Production'da Redis + BullMQ kullan, dev modda atla
if (config.env === 'production') {
  const { Queue } = require('bullmq');

  connection = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    tls: config.redis.tls || undefined,
  };

  sapQueue = new Queue('sap-calls', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });

  wmsQueue = new Queue('wms-dispatch', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });

  logger.info('BullMQ queues initialized', {
    sapMaxConcurrency: config.sap.maxConcurrency,
  });
} else {
  logger.info('BullMQ queues skipped (non-production mode)');
}

module.exports = { connection, sapQueue, wmsQueue };
