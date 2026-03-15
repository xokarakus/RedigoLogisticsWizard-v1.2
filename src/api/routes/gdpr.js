/**
 * GDPR Compliance API
 *
 * - Kisisel veri export (Data Portability)
 * - Hesap anonimizasyonu (Right to Erasure)
 * - Veri isleme kaydi (Data Processing Record)
 */
const express = require('express');
const router = express.Router();
const { query } = require('../../shared/database/pool');
const { requireRole, requireSuperAdmin } = require('../../shared/middleware/auth');
const { writeAuditLog } = require('../../shared/middleware/auditLog');
const logger = require('../../shared/utils/logger');

const adminOnly = requireRole('TENANT_ADMIN');

// ── GET /gdpr/export/:userId — Kisisel veri export ──
router.get('/export/:userId', adminOnly, async (req, res) => {
  const userId = req.params.userId;
  const tenantId = req.tenantId || req.user.tenant_id;

  try {
    // Kullanici bilgileri
    const { rows: users } = await query(
      'SELECT id, username, display_name, email, role, is_active, created_at, last_login FROM users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Kullanici bulunamadi' });
    }

    // Pagination params
    const limit = Math.min(Number(req.query.limit) || 1000, 10000);
    const offset = Number(req.query.offset) || 0;

    // Audit log kayitlari (paginated)
    const { rows: auditLogs } = await query(
      `SELECT action, entity_type, entity_id, created_at, ip_address
       FROM audit_logs WHERE user_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [userId, tenantId, limit, offset]
    );

    // Total count
    const { rows: countRows } = await query(
      'SELECT COUNT(*) AS total FROM audit_logs WHERE user_id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );
    const total = Number(countRows[0].total);

    // Export
    const exportData = {
      export_date: new Date().toISOString(),
      format_version: '1.0',
      user: users[0],
      activity_log: auditLogs,
      total,
      limit,
      offset,
      has_more: offset + limit < total,
      metadata: {
        total_actions: total,
        data_categories: ['identity', 'activity_log', 'authentication'],
        retention_policy: '90 days for audit logs'
      }
    };

    writeAuditLog({
      tenant_id: tenantId,
      user_id: req.user.user_id,
      username: req.user.username,
      action: 'GDPR_DATA_EXPORT',
      entity_type: 'user',
      entity_id: userId,
      ip_address: req.ip,
      severity: 'WARNING'
    });

    res.set('Content-Type', 'application/json');
    res.set('Content-Disposition', 'attachment; filename="gdpr-export-' + userId + '.json"');
    res.json(exportData);
  } catch (err) {
    logger.error('GDPR export error', { error: err.message, userId });
    res.status(500).json({ error: 'Veri disa aktarma hatasi' });
  }
});

// ── POST /gdpr/anonymize/:userId — Hesap anonimizasyonu ──
router.post('/anonymize/:userId', adminOnly, async (req, res) => {
  const userId = req.params.userId;
  const tenantId = req.tenantId || req.user.tenant_id;

  try {
    // Kullaniciyi kontrol et
    const { rows: users } = await query(
      'SELECT id, username, is_active FROM users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Kullanici bulunamadi' });
    }

    // Kendi hesabini anonimize edemez
    if (userId === req.user.user_id) {
      return res.status(400).json({ error: 'Kendi hesabinizi anonimize edemezsiniz' });
    }

    const anonymizedUsername = 'ANON_' + userId.substring(0, 8);
    const anonymizedEmail = anonymizedUsername + '@anonymized.local';

    // Kullaniciyi anonimize et
    await query(
      `UPDATE users SET
        username = $1,
        display_name = 'Anonimize Kullanici',
        email = $2,
        password_hash = 'ANONYMIZED',
        is_active = false,
        updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [anonymizedUsername, anonymizedEmail, userId, tenantId]
    );

    // Audit log'lardaki kisisel bilgileri anonimize et
    await query(
      `UPDATE audit_logs SET
        username = $1,
        ip_address = '0.0.0.0'
       WHERE user_id = $2 AND tenant_id = $3`,
      [anonymizedUsername, userId, tenantId]
    );

    writeAuditLog({
      tenant_id: tenantId,
      user_id: req.user.user_id,
      username: req.user.username,
      action: 'GDPR_ANONYMIZE',
      entity_type: 'user',
      entity_id: userId,
      old_values: { username: users[0].username },
      new_values: { username: anonymizedUsername },
      ip_address: req.ip,
      severity: 'CRITICAL'
    });

    res.json({
      ok: true,
      message: 'Kullanici basariyla anonimize edildi',
      anonymized_username: anonymizedUsername
    });
  } catch (err) {
    logger.error('GDPR anonymize error', { error: err.message, userId });
    res.status(500).json({ error: 'Anonimizasyon hatasi' });
  }
});

// ── GET /gdpr/processing-record — Veri isleme kaydi ──
router.get('/processing-record', adminOnly, async (req, res) => {
  const tenantId = req.tenantId || req.user.tenant_id;

  try {
    // Tenant bilgisi
    const { rows: tenants } = await query(
      'SELECT name, code, domain, created_at FROM tenants WHERE id = $1',
      [tenantId]
    );

    // Kullanici sayisi
    const { rows: userCount } = await query(
      'SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active FROM users WHERE tenant_id = $1',
      [tenantId]
    );

    // Veri kategorileri
    const { rows: dataCounts } = await query(`
      SELECT
        (SELECT COUNT(*) FROM work_orders WHERE tenant_id = $1) AS work_orders,
        (SELECT COUNT(*) FROM audit_logs WHERE tenant_id = $1) AS audit_logs,
        (SELECT COUNT(*) FROM transaction_logs WHERE tenant_id = $1) AS transaction_logs,
        (SELECT COUNT(*) FROM materials WHERE tenant_id = $1) AS materials,
        (SELECT COUNT(*) FROM business_partners WHERE tenant_id = $1) AS business_partners
    `, [tenantId]);

    const record = {
      record_date: new Date().toISOString(),
      controller: tenants[0] || {},
      processing_purposes: [
        'ERP-WMS entegrasyonu ve is emri yonetimi',
        'Stok hareketi izleme ve raporlama',
        'Kullanici kimlik dogrulama ve yetkilendirme',
        'Denetim izi (audit trail) tutma'
      ],
      data_categories: {
        identity_data: 'Kullanici adi, e-posta, gorev',
        business_data: 'Is emirleri, stok hareketleri, teslimat bilgileri',
        technical_data: 'IP adresi, islem zamani, tarayici bilgisi',
        audit_data: 'Tum CRUD islemleri, login/logout kayitlari'
      },
      data_subjects: {
        total_users: Number(userCount[0].total),
        active_users: Number(userCount[0].active)
      },
      data_volumes: dataCounts[0],
      retention_policies: {
        audit_logs: '90 gun',
        transaction_logs: '180 gun',
        work_orders: 'Arsivleme sonrasi suersiz',
        user_data: 'Hesap silme/anonimizasyon talep edilene kadar'
      },
      security_measures: [
        'JWT token bazli kimlik dogrulama',
        'RBAC (rol bazli erisim kontrolu)',
        'HMAC-SHA256 webhook imzalama',
        'HSTS + Helmet guvenlik header\'lari',
        'Zod girdi dogrulama',
        'Rate limiting (3 katman + tenant bazli)',
        'Sifre politikasi (min 8 karakter, buyuk/kucuk/rakam)'
      ],
      data_transfers: [
        'SAP ERP (RFC baglantisi)',
        '3PL/WMS sistemleri (HTTPS API)'
      ]
    };

    res.json(record);
  } catch (err) {
    logger.error('GDPR processing record error', { error: err.message });
    res.status(500).json({ error: 'Veri isleme kaydi olusturulamadi' });
  }
});

module.exports = router;
