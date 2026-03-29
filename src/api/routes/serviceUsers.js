const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const DbStore = require('../../shared/database/dbStore');
const { query } = require('../../shared/database/pool');
const { requireScope, tenantFilter } = require('../../shared/middleware/auth');
const { logAudit } = require('../../shared/middleware/auditLog');
const logger = require('../../shared/utils/logger');
const { validate } = require('../../shared/validators/middleware');
const {
  CreateServiceUserSchema,
  UpdateServiceUserSchema
} = require('../../shared/validators/config.schemas');

const adminOnly = requireScope('Admin');
const serviceUserStore = new DbStore('service_users');

function tf(req) {
  return tenantFilter(req);
}

/**
 * Generate prefixed API key: rsk_<TENANT_CODE>_<random>
 */
function generateApiKey(tenantCode) {
  const random = crypto.randomBytes(16).toString('hex');
  return `rsk_${tenantCode}_${random}`;
}

/**
 * Generate cryptographically secure API secret
 */
function generateApiSecret() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash API key with SHA-256 (for fast lookups)
 */
function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/* ═══════════════════════════════════════════
   Servis Kullanıcıları (Service Users) CRUD
   ═══════════════════════════════════════════ */

/**
 * GET /service-users
 * Tenant'a ait tüm servis kullanıcılarını listele
 */
router.get('/', async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const opts = { filter: tf(req) };
    if (limit) opts.limit = Number(limit);
    if (offset) opts.offset = Number(offset);
    const data = await serviceUserStore.readAll(opts);

    // api_secret_hash asla dönmemeli
    const sanitized = data.map(su => {
      const { api_secret_hash, api_key_hash, ...rest } = su;
      return rest;
    });

    res.json({ data: sanitized });
  } catch (err) {
    logger.error('GET /service-users error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /service-users/:id
 * Tekil servis kullanıcı
 */
router.get('/:id', async (req, res) => {
  try {
    const item = await serviceUserStore.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Service user not found' });

    // Tenant kontrolü
    if (!req.user.is_super_admin && item.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { api_secret_hash, api_key_hash, ...rest } = item;
    res.json({ data: rest });
  } catch (err) {
    logger.error('GET /service-users/:id error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /service-users
 * Yeni servis kullanıcı oluştur — credentials sadece bu response'da döner
 */
router.post('/', adminOnly, validate(CreateServiceUserSchema), async (req, res) => {
  try {
    // Tenant code'u al
    const tenantResult = await query('SELECT code FROM tenants WHERE id = $1', [req.tenantId]);
    if (!tenantResult.rows.length) {
      return res.status(400).json({ error: 'Tenant not found' });
    }
    const tenantCode = tenantResult.rows[0].code;

    // Max 5 kontrolü (DB trigger'da da var ama UX için önceden kontrol)
    const countResult = await query(
      'SELECT COUNT(*)::int AS cnt FROM service_users WHERE tenant_id = $1',
      [req.tenantId]
    );
    if (countResult.rows[0].cnt >= 5) {
      return res.status(409).json({ error: 'Maximum 5 service users per tenant reached' });
    }

    // Key + secret üret
    const apiKey = generateApiKey(tenantCode);
    const apiSecret = generateApiSecret();
    const apiKeyHash = hashApiKey(apiKey);
    const apiSecretHash = await bcrypt.hash(apiSecret, 10);

    const payload = {
      tenant_id: req.tenantId,
      name: req.body.name,
      description: req.body.description || null,
      api_key: apiKey,
      api_key_hash: apiKeyHash,
      api_secret_hash: apiSecretHash,
      scopes: req.body.scopes || ['read', 'write'],
      is_active: req.body.is_active !== undefined ? req.body.is_active : true,
      is_default: false,
      expires_at: req.body.expires_at || null,
      created_by: req.user.user_id
    };

    const item = await serviceUserStore.create(payload);
    logAudit(req, 'service_user', item.id, 'CREATE', null, { name: item.name, tenant: tenantCode });

    // Credentials sadece bu response'da plain text döner
    const { api_secret_hash: _sh, api_key_hash: _kh, ...rest } = item;
    res.status(201).json({
      data: rest,
      credentials: {
        api_key: apiKey,
        api_secret: apiSecret
      }
    });
  } catch (err) {
    if (err.message && err.message.includes('Maximum 5')) {
      return res.status(409).json({ error: 'Maximum 5 service users per tenant reached' });
    }
    logger.error('POST /service-users error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /service-users/:id
 * Güncelle (name, description, scopes, is_active, expires_at)
 */
router.put('/:id', adminOnly, validate(UpdateServiceUserSchema), async (req, res) => {
  try {
    const old = await serviceUserStore.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Service user not found' });

    if (!req.user.is_super_admin && old.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // api_key, api_key_hash, api_secret_hash güncelenemez (regenerate endpoint'i kullan)
    const { api_key, api_key_hash, api_secret_hash, tenant_id, created_by, is_default, usage_count, ...allowed } = req.body;

    const updated = await serviceUserStore.update(req.params.id, allowed);
    if (!updated) return res.status(404).json({ error: 'Service user not found' });

    logAudit(req, 'service_user', req.params.id, 'UPDATE', old, updated);

    const { api_secret_hash: _sh, api_key_hash: _kh, ...rest } = updated;
    res.json({ data: rest });
  } catch (err) {
    logger.error('PUT /service-users/:id error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /service-users/:id/regenerate
 * API key ve secret yenile — yeni credentials sadece bu response'da döner
 */
router.post('/:id/regenerate', adminOnly, async (req, res) => {
  try {
    const old = await serviceUserStore.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Service user not found' });

    if (!req.user.is_super_admin && old.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Tenant code'u al
    const tenantResult = await query('SELECT code FROM tenants WHERE id = $1', [old.tenant_id]);
    const tenantCode = tenantResult.rows[0].code;

    // Yeni key + secret üret
    const apiKey = generateApiKey(tenantCode);
    const apiSecret = generateApiSecret();
    const apiKeyHash = hashApiKey(apiKey);
    const apiSecretHash = await bcrypt.hash(apiSecret, 10);

    const updated = await serviceUserStore.update(req.params.id, {
      api_key: apiKey,
      api_key_hash: apiKeyHash,
      api_secret_hash: apiSecretHash
    });

    logAudit(req, 'service_user', req.params.id, 'REGENERATE', { api_key: old.api_key }, { api_key: apiKey });

    const { api_secret_hash: _sh, api_key_hash: _kh, ...rest } = updated;
    res.json({
      data: rest,
      credentials: {
        api_key: apiKey,
        api_secret: apiSecret
      }
    });
  } catch (err) {
    logger.error('POST /service-users/:id/regenerate error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /service-users/:id
 * Sil (usage_count=0 ise, aksi halde DB trigger engeller)
 */
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const old = await serviceUserStore.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Service user not found' });

    if (!req.user.is_super_admin && old.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await serviceUserStore.remove(req.params.id);
    logAudit(req, 'service_user', req.params.id, 'DELETE', old, null);
    res.json({ success: true });
  } catch (err) {
    // Iron Rule: DB trigger "DELETE not allowed" hatası
    if (err.message && err.message.includes('DELETE not allowed')) {
      return res.status(409).json({
        error: 'Cannot delete: service user has been used (usage_count > 0). Deactivate instead.'
      });
    }
    logger.error('DELETE /service-users/:id error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
