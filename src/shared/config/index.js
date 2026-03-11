const dotenv = require('dotenv');
dotenv.config();

let dbConfig, redisConfig, xsuaaConfig, sapConfig;

// ─────────────────────────────────────────────────
// BTP Cloud Foundry: VCAP_SERVICES'tan credential oku
// Local dev: .env'den oku
// ─────────────────────────────────────────────────
if (process.env.VCAP_SERVICES) {
  const xsenv = require('@sap/xsenv');
  const services = xsenv.getServices({
    postgres: { tag: 'postgresql' },
    redis: { tag: 'redis' },
    uaa: { tag: 'xsuaa' },
  });

  // PostgreSQL (hyperscaler — SSL zorunlu)
  const pgCreds = services.postgres;
  dbConfig = {
    host: pgCreds.hostname,
    port: parseInt(pgCreds.port, 10),
    database: pgCreds.dbname,
    user: pgCreds.username,
    password: pgCreds.password,
    max: parseInt(process.env.DB_POOL_SIZE || '15', 10),
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
    ssl: {
      rejectUnauthorized: false,
      ca: pgCreds.sslrootcert || undefined,
    },
  };

  // Redis
  const redisCreds = services.redis;
  redisConfig = {
    host: redisCreds.hostname || redisCreds.host,
    port: parseInt(redisCreds.port, 10),
    password: redisCreds.password || undefined,
    tls: redisCreds.tls ? { rejectUnauthorized: false } : undefined,
  };

  // XSUAA
  xsuaaConfig = services.uaa;

  // SAP RFC — BTP'de de .env'den okunabilir (Cloud Connector + destination)
  sapConfig = {
    ashost: process.env.SAP_ASHOST,
    sysnr: process.env.SAP_SYSNR || '00',
    client: process.env.SAP_CLIENT || '100',
    user: process.env.SAP_USER,
    passwd: process.env.SAP_PASSWORD,
    lang: process.env.SAP_LANG || 'EN',
    poolSize: parseInt(process.env.SAP_POOL_SIZE || '5', 10),
    maxConcurrency: parseInt(process.env.SAP_MAX_CONCURRENCY || '5', 10),
  };
} else {
  // ── Local Development (.env) ──
  dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'redigo_v12',
    user: process.env.DB_USER || 'redigo',
    password: process.env.DB_PASSWORD || '',
    max: parseInt(process.env.DB_POOL_SIZE || '15', 10),
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
  };

  redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  };

  xsuaaConfig = null; // local dev'de auth yok

  sapConfig = {
    ashost: process.env.SAP_ASHOST,
    sysnr: process.env.SAP_SYSNR || '00',
    client: process.env.SAP_CLIENT || '100',
    user: process.env.SAP_USER,
    passwd: process.env.SAP_PASSWORD,
    lang: process.env.SAP_LANG || 'EN',
    poolSize: parseInt(process.env.SAP_POOL_SIZE || '5', 10),
    maxConcurrency: parseInt(process.env.SAP_MAX_CONCURRENCY || '5', 10),
  };
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  env: process.env.NODE_ENV || 'development',
  db: dbConfig,
  redis: redisConfig,
  xsuaa: xsuaaConfig,
  sap: sapConfig,

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
