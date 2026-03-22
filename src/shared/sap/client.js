const config = require('../config');
const logger = require('../utils/logger');
const { dispatch } = require('../utils/httpDispatcher');
const { breakers } = require('../utils/circuitBreaker');
const DbStore = require('../database/dbStore');

/**
 * SAP HTTP Client
 *
 * SAP bağlantısı artık node-rfc yerine HTTP üzerinden çalışır.
 * 3PL ile aynı altyapı: httpDispatcher + security_profiles.
 *
 * Her company_code için farklı SAP sistemi konfigüre edilebilir.
 * Config çözümleme: security_profiles (auth).
 * Fallback: env var SAP_API_BASE_URL.
 */
class SapClient {
  constructor() {
    this.isMock = config.env !== 'production';
    this.configCache = new Map(); // companyCode → { apiBaseUrl, securityProfileId, expiresAt }
    this.CACHE_TTL = 60_000; // 1 dakika
  }

  // BAPI adı → HTTP endpoint path eşlemesi
  static BAPI_PATHS = {
    'BAPI_OUTB_DELIVERY_CHANGE': '/delivery/change',
    'WS_DELIVERY_UPDATE':        '/delivery/update',
    'BAPI_GOODSMVT_CREATE':      '/goods-movement/create',
    'BAPI_TRANSACTION_COMMIT':    null  // HTTP'de gerek yok (auto-commit)
  };

  async initialize() {
    if (this.isMock) {
      logger.warn('SAP Client running in MOCK mode (HTTP)');
      return;
    }
    logger.info('SAP Client initialized (HTTP mode)');
  }

  /**
   * company_code'a göre security_profiles'tan config çöz.
   * Sonuç cache'lenir (CACHE_TTL süresiyle).
   */
  async _resolveConfig(companyCode) {
    const cacheKey = companyCode || '_default';
    const cached = this.configCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached;

    let apiBaseUrl = config.sap.apiBaseUrl; // env var fallback
    let securityProfileId = null;

    try {
      // security_profile: company_code ile eşleşen aktif profil ara
      if (companyCode) {
        const spStore = new DbStore('security_profiles');
        const profiles = await spStore.readAll();
        const sapProfile = profiles.find(p =>
          p.is_active && p.company_code === companyCode
        );
        if (sapProfile) {
          securityProfileId = sapProfile.id;
        }
      }
    } catch (err) {
      logger.warn('SAP config resolve error, using env fallback', {
        companyCode,
        error: err.message
      });
    }

    const resolved = {
      apiBaseUrl,
      securityProfileId,
      expiresAt: Date.now() + this.CACHE_TTL
    };
    this.configCache.set(cacheKey, resolved);
    return resolved;
  }

  /**
   * SAP BAPI çağrısı — HTTP üzerinden.
   *
   * @param {string} functionName - BAPI adı (BAPI_OUTB_DELIVERY_CHANGE, vb.)
   * @param {Object} params - BAPI parametreleri (body olarak gönderilir)
   * @param {Object} [context] - { companyCode } — hangi SAP sistemi
   * @returns {Object} SAP yanıtı
   */
  async call(functionName, params, context = {}) {
    logger.debug('SAP call', { function: functionName, mode: this.isMock ? 'MOCK' : 'HTTP' });

    if (this.isMock) {
      return this._mockCall(functionName, params);
    }

    // COMMIT gereksiz — HTTP auto-commit
    if (functionName === 'BAPI_TRANSACTION_COMMIT') {
      return { RETURN: { TYPE: 'S', MESSAGE: 'Committed (HTTP auto)' } };
    }

    const path = SapClient.BAPI_PATHS[functionName];
    if (!path) {
      // Bilinmeyen BAPI — path'i fonksiyon adından türet
      logger.warn('Unknown BAPI, using function name as path', { function: functionName });
    }

    const { companyCode } = context;
    const cfg = await this._resolveConfig(companyCode);

    if (!cfg.apiBaseUrl) {
      throw new Error(
        `SAP API base URL tanımlı değil. company_code=${companyCode || '-'}. ` +
        'SAP_API_BASE_URL env var ayarlayın.'
      );
    }

    const url = cfg.apiBaseUrl + (path || '/' + functionName.toLowerCase().replace(/_/g, '-'));

    return breakers.sapRfc.exec(async () => {
      const result = await dispatch({
        url,
        method: 'POST',
        securityProfileId: cfg.securityProfileId,
        body: params,
        timeout_ms: 20000
      });

      if (!result.ok) {
        const err = new Error(`SAP HTTP ${result.statusCode}: ${result.error}`);
        err.code = 'SAP_HTTP_ERROR';
        err.statusCode = result.statusCode;
        err.responseBody = result.responseBody;
        throw err;
      }

      return result.responseBody;
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

  /**
   * Config cache'i temizle (test veya config değişikliğinde)
   */
  clearCache() {
    this.configCache.clear();
  }
}

module.exports = new SapClient();
