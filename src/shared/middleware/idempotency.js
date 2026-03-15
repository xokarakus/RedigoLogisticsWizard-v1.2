/**
 * Idempotency Key Middleware
 *
 * X-Idempotency-Key header ile ayni istegin tekrar islenmesini engeller.
 * PostgreSQL tabanlı — Redis gerektirmez.
 *
 * Kullanim: POST/PUT route'larina middleware olarak ekle.
 */
const { query } = require('../database/pool');
const logger = require('../utils/logger');

const DEFAULT_TTL_HOURS = 24;

/**
 * idempotency(opts)
 * @param {Object} opts
 * @param {number} opts.ttlHours - Key'in gecerlilik suresi (default: 24 saat)
 */
function idempotency(opts = {}) {
  const ttlHours = opts.ttlHours || DEFAULT_TTL_HOURS;

  return async (req, res, next) => {
    const idempotencyKey = req.headers['x-idempotency-key'];
    if (!idempotencyKey) {
      return next(); // Key yoksa normal islem
    }

    const tenantId = req.tenantId || req.user && req.user.tenant_id || null;
    const cacheKey = (tenantId || 'global') + ':' + idempotencyKey;

    try {
      // Onceki sonucu kontrol et
      const { rows } = await query(
        `SELECT response_status, response_body, created_at
         FROM idempotency_keys
         WHERE cache_key = $1 AND created_at > NOW() - INTERVAL '${ttlHours} hours'`,
        [cacheKey]
      );

      if (rows.length > 0) {
        const cached = rows[0];
        logger.info('Idempotency cache hit', { key: idempotencyKey, cachedAt: cached.created_at });
        res.set('X-Idempotency-Replayed', 'true');
        return res.status(cached.response_status).json(cached.response_body);
      }

      // Orijinal response'u yakala
      const originalJson = res.json.bind(res);
      res.json = function (body) {
        // Sonucu kaydet (fire & forget)
        query(
          `INSERT INTO idempotency_keys (cache_key, idempotency_key, tenant_id, method, path, response_status, response_body)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (cache_key) DO NOTHING`,
          [cacheKey, idempotencyKey, tenantId, req.method, req.originalUrl, res.statusCode, JSON.stringify(body)]
        ).catch(err => logger.error('Idempotency save failed', { error: err.message }));

        return originalJson(body);
      };

      next();
    } catch (err) {
      // Idempotency hatasi islemi engellememeli
      logger.error('Idempotency middleware error', { error: err.message });
      next();
    }
  };
}

module.exports = { idempotency };
