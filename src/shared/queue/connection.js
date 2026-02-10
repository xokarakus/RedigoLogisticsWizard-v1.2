const { Queue, Worker } = require('bullmq');
const config = require('../config');
const logger = require('../utils/logger');

const connection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
};

// SAP call queue with rate limiting (max 5 concurrent)
const sapQueue = new Queue('sap-calls', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

// WMS dispatch queue
const wmsQueue = new Queue('wms-dispatch', {
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

module.exports = { connection, sapQueue, wmsQueue };
