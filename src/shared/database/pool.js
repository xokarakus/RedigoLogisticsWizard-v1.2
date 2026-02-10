const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

const pool = new Pool(config.db);

pool.on('error', (err) => {
  logger.error('Unexpected DB pool error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New DB client connected');
});

const query = (text, params) => pool.query(text, params);

const getClient = () => pool.connect();

module.exports = { pool, query, getClient };
