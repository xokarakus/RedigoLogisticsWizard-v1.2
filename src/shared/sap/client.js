const config = require('../config');
const logger = require('../utils/logger');
const { breakers } = require('../utils/circuitBreaker');

// SAP RFC connection pool wrapper
// In production: uses node-rfc. In dev/test: mock mode.
class SapClient {
  constructor() {
    this.pool = null;
    this.isMock = config.env !== 'production';
  }

  async initialize() {
    if (this.isMock) {
      logger.warn('SAP Client running in MOCK mode');
      return;
    }

    try {
      const noderfc = require('node-rfc');
      this.pool = new noderfc.Pool({
        connectionParameters: {
          ashost: config.sap.ashost,
          sysnr: config.sap.sysnr,
          client: config.sap.client,
          user: config.sap.user,
          passwd: config.sap.passwd,
          lang: config.sap.lang,
        },
        poolOptions: {
          low: 1,
          high: config.sap.poolSize,
        },
      });
      logger.info('SAP RFC pool initialized', { poolSize: config.sap.poolSize });
    } catch (err) {
      logger.error('Failed to initialize SAP RFC pool', { error: err.message });
      throw err;
    }
  }

  async call(functionName, params) {
    logger.debug('SAP RFC call', { function: functionName });

    if (this.isMock) {
      return this._mockCall(functionName, params);
    }

    return breakers.sapRfc.exec(async () => {
      const client = await this.pool.acquire();
      try {
        const result = await client.call(functionName, params);
        return result;
      } finally {
        await this.pool.release(client);
      }
    });
  }

  _mockCall(functionName, params) {
    logger.debug('SAP MOCK call', { function: functionName, params });

    const mocks = {
      BAPI_OUTB_DELIVERY_CHANGE: () => ({
        RETURN: [{ TYPE: 'S', MESSAGE: 'Delivery updated successfully' }],
      }),
      WS_DELIVERY_UPDATE: () => ({
        RETURN: [{ TYPE: 'S', MESSAGE: 'PGI posted successfully' }],
        E_VBELN: params.VBELN || '0080001234',
      }),
      BAPI_GOODSMVT_CREATE: () => ({
        GOODSMVT_HEADRET: { MAT_DOC: '5000001234', DOC_YEAR: '2026' },
        RETURN: [{ TYPE: 'S', MESSAGE: 'Goods movement posted' }],
      }),
      BAPI_TRANSACTION_COMMIT: () => ({
        RETURN: { TYPE: 'S', MESSAGE: 'Committed' },
      }),
    };

    const mockFn = mocks[functionName];
    if (mockFn) return mockFn();

    return { RETURN: [{ TYPE: 'S', MESSAGE: `Mock: ${functionName} OK` }] };
  }

  async close() {
    if (this.pool) {
      await this.pool.releaseAll();
      logger.info('SAP RFC pool closed');
    }
  }
}

module.exports = new SapClient();
