/**
 * Webhook Authentication Middleware
 * API Key + HMAC-SHA256 signature dogrulama
 *
 * Header'lar:
 *   X-API-Key:    Webhook API anahtari (system_settings'de saklanir)
 *   X-Signature:  HMAC-SHA256(body, secret) — opsiyonel, varsa dogrulanir
 *   X-Timestamp:  Unix timestamp (replay attack koruması, 5dk tolerans)
 */
const crypto = require('crypto');
const { query } = require('../database/pool');
const logger = require('../utils/logger');

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 dakika

/**
 * webhookAuth(options)
 * @param {Object} options
 * @param {string} options.settingsKey - system_settings tablosundaki anahtar (orn: 'webhook_wms', 'webhook_inbound')
 * @param {boolean} [options.requireSignature=false] - HMAC signature zorunlu mu?
 */
function webhookAuth(options = {}) {
  const { settingsKey = 'webhook_api_key', requireSignature = false } = options;

  return async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    // API Key yoksa → 401
    if (!apiKey) {
      logger.warn('Webhook auth failed: missing X-API-Key', {
        ip: req.ip,
        path: req.originalUrl
      });
      return res.status(401).json({ error: 'X-API-Key header gerekli' });
    }

    try {
      // Veritabanindan tum tenant'larin webhook key'lerini kontrol et
      const { rows } = await query(
        `SELECT ss.tenant_id, ss.value
         FROM system_settings ss
         WHERE ss.key = $1`,
        [settingsKey]
      );

      // Herhangi bir tenant'in key'i eslesiyor mu?
      let matchedTenantId = null;
      let webhookSecret = null;

      for (const row of rows) {
        let config;
        try {
          config = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        } catch (_) {
          continue;
        }

        if (config && config.api_key === apiKey) {
          matchedTenantId = row.tenant_id;
          webhookSecret = config.secret || null;
          break;
        }
      }

      // Global fallback: env variable ile tanimlanan tek bir key
      if (!matchedTenantId) {
        const envKey = process.env.WEBHOOK_API_KEY;
        if (envKey && apiKey === envKey) {
          matchedTenantId = '__global__';
          webhookSecret = process.env.WEBHOOK_SECRET || null;
        }
      }

      if (!matchedTenantId) {
        logger.warn('Webhook auth failed: invalid API key', {
          ip: req.ip,
          path: req.originalUrl
        });
        return res.status(403).json({ error: 'Gecersiz API anahtari' });
      }

      // Timestamp dogrulama (replay attack koruması)
      const timestamp = req.headers['x-timestamp'];
      if (timestamp) {
        const ts = parseInt(timestamp, 10) * 1000; // Unix seconds -> ms
        const now = Date.now();
        if (isNaN(ts) || Math.abs(now - ts) > REPLAY_WINDOW_MS) {
          return res.status(403).json({ error: 'Istek zamani gecersiz veya suresi dolmus' });
        }
      }

      // HMAC signature dogrulama
      const signature = req.headers['x-signature'];
      if (requireSignature && !signature) {
        return res.status(401).json({ error: 'X-Signature header gerekli' });
      }

      if (signature && webhookSecret) {
        const body = JSON.stringify(req.body);
        const expected = crypto
          .createHmac('sha256', webhookSecret)
          .update(body)
          .digest('hex');

        // Timing-safe comparison
        const sigBuffer = Buffer.from(signature, 'hex');
        const expectedBuffer = Buffer.from(expected, 'hex');

        if (sigBuffer.length !== expectedBuffer.length ||
            !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
          logger.warn('Webhook auth failed: invalid signature', {
            ip: req.ip,
            path: req.originalUrl
          });
          return res.status(403).json({ error: 'Gecersiz imza' });
        }
      }

      // Tenant ID'yi req'e ekle (tenant-scoped islem icin)
      if (matchedTenantId !== '__global__') {
        req.webhookTenantId = matchedTenantId;
      }

      next();
    } catch (err) {
      logger.error('Webhook auth error', { error: err.message });
      return res.status(500).json({ error: 'Kimlik dogrulama hatasi' });
    }
  };
}

module.exports = { webhookAuth };
