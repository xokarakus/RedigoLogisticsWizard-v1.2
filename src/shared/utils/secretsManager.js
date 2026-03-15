/**
 * Secrets Manager
 *
 * BTP Credential Store entegrasyonu + local env fallback.
 * Secret rotation destegi: JWT_SECRET, DB_PASSWORD, SAP_PASSWORD, WEBHOOK_SECRET vb.
 *
 * Production: BTP Credential Store REST API
 * Development: process.env + DB-backed rotation log
 *
 * Kullanim:
 *   const secrets = require('./secretsManager');
 *   const jwtSecret = await secrets.get('JWT_SECRET');
 *   await secrets.rotate('JWT_SECRET', { newValue: '...' });
 */
const crypto = require('crypto');
const { query } = require('../database/pool');
const logger = require('./logger');

// ── In-memory cache ──
const _cache = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 dakika

// ── BTP Credential Store config ──
const BTP_CREDSTORE_URL = process.env.BTP_CREDSTORE_URL || '';
const BTP_CREDSTORE_USERNAME = process.env.BTP_CREDSTORE_USERNAME || '';
const BTP_CREDSTORE_PASSWORD = process.env.BTP_CREDSTORE_PASSWORD || '';
const BTP_CREDSTORE_NAMESPACE = process.env.BTP_CREDSTORE_NAMESPACE || 'redigo';

/**
 * BTP Credential Store aktif mi?
 */
function isBTPEnabled() {
  return !!(BTP_CREDSTORE_URL && BTP_CREDSTORE_USERNAME && BTP_CREDSTORE_PASSWORD);
}

/**
 * BTP Credential Store'dan secret oku.
 * @param {string} name - Secret adi
 * @returns {Promise<string|null>}
 */
async function _btpGet(name) {
  try {
    const url = `${BTP_CREDSTORE_URL}/api/v1/credentials/${BTP_CREDSTORE_NAMESPACE}/${encodeURIComponent(name)}`;
    const auth = Buffer.from(`${BTP_CREDSTORE_USERNAME}:${BTP_CREDSTORE_PASSWORD}`).toString('base64');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`BTP CredStore GET failed: ${response.status}`);
    }

    const data = await response.json();
    return data.value || null;
  } catch (err) {
    logger.error('BTP Credential Store GET error', { name, error: err.message });
    return null;
  }
}

/**
 * BTP Credential Store'a secret yaz/guncelle.
 * @param {string} name
 * @param {string} value
 * @returns {Promise<boolean>}
 */
async function _btpSet(name, value) {
  try {
    const url = `${BTP_CREDSTORE_URL}/api/v1/credentials/${BTP_CREDSTORE_NAMESPACE}/${encodeURIComponent(name)}`;
    const auth = Buffer.from(`${BTP_CREDSTORE_USERNAME}:${BTP_CREDSTORE_PASSWORD}`).toString('base64');

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value })
    });

    if (!response.ok) {
      throw new Error(`BTP CredStore PUT failed: ${response.status}`);
    }

    return true;
  } catch (err) {
    logger.error('BTP Credential Store SET error', { name, error: err.message });
    return false;
  }
}

/**
 * Secret degerini getir.
 * Oncelik: Cache > BTP Credential Store > process.env > DB (rotation log)
 * @param {string} name - Secret adi (orn. JWT_SECRET, DB_PASSWORD)
 * @returns {Promise<string|null>}
 */
async function get(name) {
  // Cache kontrol
  const cached = _cache[name];
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let value = null;

  // BTP Credential Store
  if (isBTPEnabled()) {
    value = await _btpGet(name);
    if (value) {
      _cache[name] = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      return value;
    }
  }

  // process.env fallback
  value = process.env[name] || null;
  if (value) {
    _cache[name] = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }

  // DB rotation log'dan son aktif degeri al
  try {
    const { rows } = await query(
      `SELECT new_value FROM secret_rotation_log
       WHERE secret_name = $1 AND status = 'ACTIVE'
       ORDER BY rotated_at DESC LIMIT 1`,
      [name]
    );
    if (rows.length > 0) {
      value = rows[0].new_value;
      _cache[name] = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    }
  } catch (err) {
    // Tablo yoksa veya DB hatasi — sessizce devam
    logger.warn('Secret rotation log read failed', { name, error: err.message });
  }

  return value;
}

/**
 * Secret'i rotate et.
 * @param {string} name - Secret adi
 * @param {Object} opts
 * @param {string} [opts.newValue] - Yeni deger (verilmezse random generate edilir)
 * @param {number} [opts.length=64] - Random generation uzunlugu
 * @param {string} [opts.rotatedBy] - Kim tarafindan rotate edildi
 * @param {string} [opts.reason] - Neden rotate edildi
 * @returns {Promise<{ok: boolean, name: string, rotatedAt: string}>}
 */
async function rotate(name, opts = {}) {
  const {
    newValue = crypto.randomBytes(opts.length || 64).toString('hex'),
    rotatedBy = 'system',
    reason = 'Scheduled rotation'
  } = opts;

  try {
    // Onceki degeri bul
    const oldValue = await get(name);

    // BTP Credential Store'a yaz
    if (isBTPEnabled()) {
      const ok = await _btpSet(name, newValue);
      if (!ok) {
        throw new Error('BTP Credential Store update failed');
      }
    }

    // DB rotation log'a kaydet
    await query(
      `INSERT INTO secret_rotation_log (secret_name, old_value_hash, new_value, status, rotated_by, reason)
       VALUES ($1, $2, $3, 'ACTIVE', $4, $5)`,
      [
        name,
        oldValue ? crypto.createHash('sha256').update(oldValue).digest('hex').substring(0, 16) : null,
        newValue,
        rotatedBy,
        reason
      ]
    );

    // Onceki kayitlari ROTATED olarak isaretle
    await query(
      `UPDATE secret_rotation_log SET status = 'ROTATED'
       WHERE secret_name = $1 AND status = 'ACTIVE'
       AND id != (SELECT id FROM secret_rotation_log WHERE secret_name = $1 AND status = 'ACTIVE' ORDER BY rotated_at DESC LIMIT 1)`,
      [name]
    );

    // Cache'i guncelle
    _cache[name] = { value: newValue, expiresAt: Date.now() + CACHE_TTL_MS };

    // process.env'i de guncelle (runtime icin)
    process.env[name] = newValue;

    logger.info('Secret rotated', { name, rotatedBy, reason });

    return {
      ok: true,
      name,
      rotatedAt: new Date().toISOString()
    };
  } catch (err) {
    logger.error('Secret rotation failed', { name, error: err.message });
    return { ok: false, name, error: err.message };
  }
}

/**
 * Rotation gecmisini getir.
 * @param {string} [name] - Belirli bir secret (null = tum secretlar)
 * @param {number} [limit=20]
 * @returns {Promise<Array>}
 */
async function getRotationHistory(name, limit = 20) {
  try {
    let sql = `SELECT id, secret_name, old_value_hash, status, rotated_by, reason, rotated_at
               FROM secret_rotation_log`;
    const params = [];

    if (name) {
      sql += ' WHERE secret_name = $1';
      params.push(name);
    }

    sql += ' ORDER BY rotated_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const { rows } = await query(sql, params);
    return rows;
  } catch (err) {
    logger.error('Rotation history query failed', { error: err.message });
    return [];
  }
}

/**
 * Yonetilen secret'larin listesini getir.
 * @returns {Promise<Array>}
 */
async function listSecrets() {
  try {
    const { rows } = await query(
      `SELECT secret_name, status, rotated_by, reason, rotated_at
       FROM secret_rotation_log
       WHERE status = 'ACTIVE'
       ORDER BY secret_name`
    );

    // Env-based secret'lari da ekle
    const ENV_SECRETS = [
      'JWT_SECRET', 'DB_PASSWORD', 'SAP_PASSWORD', 'REDIS_PASSWORD',
      'SENTRY_DSN', 'WEBHOOK_SECRET', 'BTP_CREDSTORE_PASSWORD'
    ];

    const managed = rows.map(r => r.secret_name);
    const result = [];

    for (const name of ENV_SECRETS) {
      const inDb = rows.find(r => r.secret_name === name);
      result.push({
        name,
        source: isBTPEnabled() ? 'BTP_CREDSTORE' : (inDb ? 'DB_ROTATION' : 'ENV'),
        lastRotated: inDb ? inDb.rotated_at : null,
        rotatedBy: inDb ? inDb.rotated_by : null,
        hasValue: !!(process.env[name] || (inDb && inDb.status === 'ACTIVE'))
      });
    }

    return result;
  } catch (err) {
    logger.error('List secrets failed', { error: err.message });

    // DB olmadan da env secret'larini listele
    const ENV_SECRETS = [
      'JWT_SECRET', 'DB_PASSWORD', 'SAP_PASSWORD', 'REDIS_PASSWORD',
      'SENTRY_DSN', 'WEBHOOK_SECRET', 'BTP_CREDSTORE_PASSWORD'
    ];
    return ENV_SECRETS.map(name => ({
      name,
      source: 'ENV',
      lastRotated: null,
      rotatedBy: null,
      hasValue: !!process.env[name]
    }));
  }
}

/**
 * Cache'i temizle.
 */
function clearCache() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}

module.exports = {
  get,
  rotate,
  getRotationHistory,
  listSecrets,
  clearCache,
  isBTPEnabled
};
