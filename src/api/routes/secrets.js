/**
 * Secrets Management API
 *
 * Secret rotation, listeleme ve gecmis goruntuleme.
 * Sadece SUPER_ADMIN erisebilir.
 */
const express = require('express');
const router = express.Router();
const { requireSuperAdmin } = require('../../shared/middleware/auth');
const { writeAuditLog } = require('../../shared/middleware/auditLog');
const secrets = require('../../shared/utils/secretsManager');
const logger = require('../../shared/utils/logger');

const superOnly = requireSuperAdmin;

// ── GET /secrets — Yonetilen secret'larin listesi ──
router.get('/', superOnly, async (req, res) => {
  try {
    const list = await secrets.listSecrets();
    res.json({
      btpEnabled: secrets.isBTPEnabled(),
      secrets: list.map(s => ({
        name: s.name,
        source: s.source,
        lastRotated: s.lastRotated,
        rotatedBy: s.rotatedBy,
        hasValue: s.hasValue
        // new_value ASLA donmez!
      }))
    });
  } catch (err) {
    logger.error('List secrets error', { error: err.message });
    res.status(500).json({ error: 'Secret listesi alinamadi' });
  }
});

// ── POST /secrets/:name/rotate — Secret rotate et ──
router.post('/:name/rotate', superOnly, async (req, res) => {
  const { name } = req.params;
  const { reason } = req.body || {};

  // Izin verilen secret'lar
  const ALLOWED = [
    'JWT_SECRET', 'WEBHOOK_SECRET', 'SAP_PASSWORD', 'REDIS_PASSWORD'
  ];

  if (!ALLOWED.includes(name)) {
    return res.status(400).json({
      error: 'Bu secret rotate edilemez',
      allowed: ALLOWED
    });
  }

  try {
    const result = await secrets.rotate(name, {
      rotatedBy: req.user.username || 'admin',
      reason: reason || 'Manual rotation via API'
    });

    if (!result.ok) {
      return res.status(500).json({ error: result.error });
    }

    writeAuditLog({
      tenant_id: null,
      user_id: req.user.user_id,
      username: req.user.username,
      action: 'SECRET_ROTATED',
      entity_type: 'secret',
      entity_id: name,
      new_values: { reason: reason || 'Manual rotation' },
      ip_address: req.ip,
      severity: 'CRITICAL'
    });

    res.json({
      ok: true,
      name,
      rotatedAt: result.rotatedAt,
      message: `${name} basariyla rotate edildi`
    });
  } catch (err) {
    logger.error('Secret rotation error', { name, error: err.message });
    res.status(500).json({ error: 'Rotation basarisiz' });
  }
});

// ── GET /secrets/:name/history — Rotation gecmisi ──
router.get('/:name/history', superOnly, async (req, res) => {
  const { name } = req.params;
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);

  try {
    const history = await secrets.getRotationHistory(name, limit);
    res.json({
      secret: name,
      history: history.map(h => ({
        id: h.id,
        oldValueHash: h.old_value_hash,
        status: h.status,
        rotatedBy: h.rotated_by,
        reason: h.reason,
        rotatedAt: h.rotated_at
        // new_value ASLA donmez!
      }))
    });
  } catch (err) {
    logger.error('Rotation history error', { name, error: err.message });
    res.status(500).json({ error: 'Gecmis alinamadi' });
  }
});

// ── POST /secrets/:name/revoke — Aktif secret'i iptal et ──
router.post('/:name/revoke', superOnly, async (req, res) => {
  const { name } = req.params;
  const { reason } = req.body || {};

  try {
    const { rowCount } = await require('../../shared/database/pool').query(
      `UPDATE secret_rotation_log SET status = 'REVOKED'
       WHERE secret_name = $1 AND status = 'ACTIVE'`,
      [name]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Aktif secret bulunamadi' });
    }

    secrets.clearCache();

    writeAuditLog({
      tenant_id: null,
      user_id: req.user.user_id,
      username: req.user.username,
      action: 'SECRET_REVOKED',
      entity_type: 'secret',
      entity_id: name,
      new_values: { reason: reason || 'Manual revocation' },
      ip_address: req.ip,
      severity: 'CRITICAL'
    });

    logger.warn('Secret revoked', { name, revokedBy: req.user.username });

    res.json({
      ok: true,
      name,
      message: `${name} iptal edildi. Yeni bir rotation yapmaniz gerekir.`
    });
  } catch (err) {
    logger.error('Secret revoke error', { name, error: err.message });
    res.status(500).json({ error: 'Revoke basarisiz' });
  }
});

module.exports = router;
