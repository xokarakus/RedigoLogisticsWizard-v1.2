/**
 * Feature Flags
 *
 * Tenant bazli feature toggle sistemi.
 * Oncelik: Tenant-specific > Global > Default (false)
 *
 * Kullanim:
 *   const { isEnabled } = require('./featureFlags');
 *   if (await isEnabled('bulk_operations', tenantId)) { ... }
 */
const { query } = require('../database/pool');
const logger = require('./logger');

// In-memory cache: { 'tenantId:flagKey': { enabled, expiresAt } }
const cache = {};
const CACHE_TTL_MS = 60 * 1000; // 1 dakika

/**
 * Feature flag'in aktif olup olmadigini kontrol et.
 * @param {string} flagKey - Flag adi
 * @param {string|null} tenantId - Tenant ID (null = global)
 * @returns {Promise<boolean>}
 */
async function isEnabled(flagKey, tenantId) {
  const cacheKey = (tenantId || 'global') + ':' + flagKey;

  // Cache kontrol
  const cached = cache[cacheKey];
  if (cached && cached.expiresAt > Date.now()) {
    return cached.enabled;
  }

  try {
    // Tenant-specific flag'i kontrol et, yoksa global'e fallback
    const { rows } = await query(
      `SELECT enabled FROM feature_flags
       WHERE flag_key = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
       ORDER BY tenant_id IS NULL ASC
       LIMIT 1`,
      [flagKey, tenantId]
    );

    const enabled = rows.length > 0 ? rows[0].enabled : false;

    // Cache'e yaz
    cache[cacheKey] = { enabled, expiresAt: Date.now() + CACHE_TTL_MS };

    return enabled;
  } catch (err) {
    logger.error('Feature flag check failed', { flag: flagKey, error: err.message });
    return false; // Hata durumunda varsayilan: kapali
  }
}

/**
 * Tum flag'leri getir (admin paneli icin).
 * @param {string|null} tenantId
 * @returns {Promise<Array>}
 */
async function getAll(tenantId) {
  try {
    const { rows } = await query(
      `SELECT f.*, t.name AS tenant_name, t.code AS tenant_code
       FROM feature_flags f
       LEFT JOIN tenants t ON t.id = f.tenant_id
       WHERE f.tenant_id = $1 OR f.tenant_id IS NULL
       ORDER BY f.flag_key`,
      [tenantId]
    );
    return rows;
  } catch (err) {
    logger.error('Feature flags getAll failed', { error: err.message });
    return [];
  }
}

/**
 * Flag'i guncelle veya olustur.
 * @param {string} flagKey
 * @param {boolean} enabled
 * @param {string|null} tenantId - null = global flag
 * @param {Object} opts - { description, metadata }
 */
async function setFlag(flagKey, enabled, tenantId, opts = {}) {
  const { description, metadata } = opts;

  await query(
    `INSERT INTO feature_flags (tenant_id, flag_key, enabled, description, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (tenant_id, flag_key) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       description = COALESCE(EXCLUDED.description, feature_flags.description),
       metadata = COALESCE(EXCLUDED.metadata, feature_flags.metadata),
       updated_at = NOW()`,
    [tenantId, flagKey, enabled, description || null, metadata ? JSON.stringify(metadata) : null]
  );

  // Cache'i temizle
  const cacheKey = (tenantId || 'global') + ':' + flagKey;
  delete cache[cacheKey];
}

/**
 * Flag'i sil.
 */
async function removeFlag(flagKey, tenantId) {
  await query(
    'DELETE FROM feature_flags WHERE flag_key = $1 AND tenant_id = $2',
    [flagKey, tenantId]
  );
  const cacheKey = (tenantId || 'global') + ':' + flagKey;
  delete cache[cacheKey];
}

/**
 * Cache'i temizle (test/yeniden yukleme icin).
 */
function clearCache() {
  Object.keys(cache).forEach(k => delete cache[k]);
}

/**
 * Express middleware: feature flag kontrolu.
 * Flag kapali ise 403 doner.
 */
function requireFlag(flagKey) {
  return async (req, res, next) => {
    const tenantId = req.tenantId || (req.user && req.user.tenant_id) || null;
    const enabled = await isEnabled(flagKey, tenantId);
    if (!enabled) {
      return res.status(403).json({
        error: 'Bu ozellik su anda aktif degil',
        feature: flagKey
      });
    }
    next();
  };
}

module.exports = { isEnabled, getAll, setFlag, removeFlag, clearCache, requireFlag };
