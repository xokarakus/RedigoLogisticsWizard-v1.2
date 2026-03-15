/**
 * Circuit Breaker Pattern
 *
 * SAP RFC ve 3PL HTTP cagrilari icin koruma mekanizmasi.
 * CLOSED → OPEN (N ardisik hata sonrasi) → HALF_OPEN (cooldown sonrasi) → CLOSED (basarili probe)
 */
const logger = require('./logger');

const STATE = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

class CircuitBreaker {
  /**
   * @param {string} name - Breaker adi (orn: 'sap-rfc', '3pl-wms-dispatch')
   * @param {Object} opts
   * @param {number} opts.failureThreshold - Acilma esigi (default: 5)
   * @param {number} opts.cooldownMs - OPEN'dan HALF_OPEN'a gecis suresi (default: 30000)
   * @param {number} opts.halfOpenMax - HALF_OPEN'da izin verilen istek sayisi (default: 1)
   * @param {number} opts.timeoutMs - Her istek icin timeout (default: 30000)
   */
  constructor(name, opts = {}) {
    this.name = name;
    this.failureThreshold = opts.failureThreshold || 5;
    this.cooldownMs = opts.cooldownMs || 30000;
    this.halfOpenMax = opts.halfOpenMax || 1;
    this.timeoutMs = opts.timeoutMs || 30000;

    this.state = STATE.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenAttempts = 0;
    this.successCount = 0;
    this.totalCalls = 0;
    this.totalFailures = 0;
  }

  /**
   * Korunan fonksiyonu calistir.
   * @param {Function} fn - async fonksiyon
   * @returns {Promise<*>}
   */
  async exec(fn) {
    this.totalCalls++;

    if (this.state === STATE.OPEN) {
      // Cooldown suresi doldu mu?
      if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
        this.state = STATE.HALF_OPEN;
        this.halfOpenAttempts = 0;
        logger.info('Circuit breaker HALF_OPEN', { name: this.name });
      } else {
        this.totalFailures++;
        const err = new Error('Circuit breaker OPEN: ' + this.name + ' gecici olarak devre disi');
        err.code = 'CIRCUIT_BREAKER_OPEN';
        err.retryAfterMs = this.cooldownMs - (Date.now() - this.lastFailureTime);
        throw err;
      }
    }

    if (this.state === STATE.HALF_OPEN && this.halfOpenAttempts >= this.halfOpenMax) {
      const err = new Error('Circuit breaker HALF_OPEN: ' + this.name + ' probe limiti asildi');
      err.code = 'CIRCUIT_BREAKER_OPEN';
      throw err;
    }

    if (this.state === STATE.HALF_OPEN) {
      this.halfOpenAttempts++;
    }

    // Timeout sarmalayici
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => {
          setTimeout(() => {
            const err = new Error('Circuit breaker timeout: ' + this.name + ' (' + this.timeoutMs + 'ms)');
            err.code = 'CIRCUIT_BREAKER_TIMEOUT';
            reject(err);
          }, this.timeoutMs);
        })
      ]);

      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure(err);
      throw err;
    }
  }

  _onSuccess() {
    this.successCount++;
    if (this.state === STATE.HALF_OPEN) {
      this.state = STATE.CLOSED;
      this.failureCount = 0;
      logger.info('Circuit breaker CLOSED (recovered)', { name: this.name });
    } else {
      this.failureCount = 0;
    }
  }

  _onFailure(err) {
    this.failureCount++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === STATE.HALF_OPEN) {
      this.state = STATE.OPEN;
      logger.warn('Circuit breaker OPEN (half-open probe failed)', {
        name: this.name, error: err.message
      });
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = STATE.OPEN;
      logger.warn('Circuit breaker OPEN (threshold reached)', {
        name: this.name, failures: this.failureCount, threshold: this.failureThreshold
      });
    }
  }

  /** Mevcut durum bilgisi */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      failureThreshold: this.failureThreshold,
      cooldownMs: this.cooldownMs,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      stats: {
        totalCalls: this.totalCalls,
        totalFailures: this.totalFailures,
        successCount: this.successCount,
        errorRate: this.totalCalls > 0 ? (this.totalFailures / this.totalCalls * 100).toFixed(1) + '%' : '0%'
      }
    };
  }

  /** Manuel reset */
  reset() {
    this.state = STATE.CLOSED;
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    logger.info('Circuit breaker manually reset', { name: this.name });
  }
}

// ── Singleton breaker'lar ──
const breakers = {
  sapRfc: new CircuitBreaker('sap-rfc', {
    failureThreshold: 5,
    cooldownMs: 30000,    // 30sn
    timeoutMs: 20000      // 20sn per BAPI call
  }),
  threepl: new CircuitBreaker('3pl-dispatch', {
    failureThreshold: 3,
    cooldownMs: 60000,    // 1dk
    timeoutMs: 35000      // 35sn (dispatch default 30sn + margin)
  })
};

/** Tum breaker'larin durumunu getir */
function getAllStatus() {
  return Object.values(breakers).map(b => b.getStatus());
}

module.exports = { CircuitBreaker, breakers, getAllStatus, STATE };
