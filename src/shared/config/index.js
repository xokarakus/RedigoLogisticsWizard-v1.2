const dotenv = require('dotenv');
dotenv.config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  env: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'redigo_v12',
    user: process.env.DB_USER || 'redigo',
    password: process.env.DB_PASSWORD || '',
    max: parseInt(process.env.DB_POOL_SIZE || '10', 10),
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  sap: {
    ashost: process.env.SAP_ASHOST,
    sysnr: process.env.SAP_SYSNR || '00',
    client: process.env.SAP_CLIENT || '100',
    user: process.env.SAP_USER,
    passwd: process.env.SAP_PASSWORD,
    lang: process.env.SAP_LANG || 'EN',
    poolSize: parseInt(process.env.SAP_POOL_SIZE || '5', 10),
    maxConcurrency: parseInt(process.env.SAP_MAX_CONCURRENCY || '5', 10),
  },

  cron: {
    deliveryIngest: process.env.CRON_DELIVERY_INGEST || '*/5 * * * *',
    reconciliation: process.env.CRON_RECONCILIATION || '0 3 * * *',
    archiveDays: parseInt(process.env.CRON_ARCHIVE_DAYS || '90', 10),
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

module.exports = config;
