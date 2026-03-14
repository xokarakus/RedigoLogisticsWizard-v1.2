const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const DbStore = require('../../shared/database/dbStore');
const logger = require('../../shared/utils/logger');
const { logAudit, logAuditWithSeverity } = require('../../shared/middleware/auditLog');
const emailService = require('../../shared/utils/emailService');
const {
  authenticate, requireRole, requireSuperAdmin,
  tenantFilter, validateSuperAdminEmail,
  JWT_SECRET, SUPER_ADMIN_DOMAIN
} = require('../../shared/middleware/auth');

const { query } = require('../../shared/database/pool');

const userStore = new DbStore('users');
const tenantStore = new DbStore('tenants');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const REFRESH_TOKEN_DAYS = parseInt(process.env.REFRESH_TOKEN_DAYS || '7', 10);

const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 15;

/* ═══════════════════════════════════════════
   GET /api/auth/setup-status
   Sistem kurulumu gerekiyor mu? (auth YOK)
   ═══════════════════════════════════════════ */
router.get('/setup-status', async (req, res) => {
  try {
    const users = await userStore.readAll({ limit: 1 });
    res.json({ needs_setup: users.length === 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   POST /api/auth/setup
   Ilk kurulum: tenant + super admin olustur
   ═══════════════════════════════════════════ */
router.post('/setup', async (req, res) => {
  try {
    const existingUsers = await userStore.readAll({ limit: 1 });
    if (existingUsers.length > 0) {
      return res.status(403).json({ error: 'Sistem zaten kurulu' });
    }

    const { username, password, display_name, company_name, company_code } = req.body;
    if (!username || !password || !company_name || !company_code) {
      return res.status(400).json({ error: 'Kullan\u0131c\u0131 ad\u0131, \u015fifre, \u015firket ad\u0131 ve kodu gerekli' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '\u015eifre en az 6 karakter olmal\u0131' });
    }

    const tenant = await tenantStore.create({
      code: company_code.toUpperCase(),
      name: company_name,
      title: company_name,
      is_active: true,
      is_system_tenant: true
    });

    const hash = await bcrypt.hash(password, 10);
    await userStore.create({
      tenant_id: tenant.id,
      username,
      password_hash: hash,
      display_name: display_name || username,
      role: 'SUPER_ADMIN',
      is_super_admin: true,
      is_active: true
    });

    logger.info('System setup completed', { username, tenant: tenant.code });
    res.status(201).json({ message: 'Sistem kurulumu tamamland\u0131' });
  } catch (err) {
    if (err.message && err.message.includes('duplicate key')) {
      return res.status(409).json({ error: 'Bu kullan\u0131c\u0131 ad\u0131 veya \u015firket kodu zaten mevcut' });
    }
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   POST /api/auth/login
   ═══════════════════════════════════════════ */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Kullan\u0131c\u0131 ad\u0131 ve \u015fifre gerekli' });
    }

    const users = await userStore.readAll({ filter: { username } });
    const user = users[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Ge\u00e7ersiz kullan\u0131c\u0131 ad\u0131 veya \u015fifre' });
    }

    // Hesap kilitleme kontrolu
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({
        error: 'Hesab\u0131n\u0131z kilitlendi. ' + remaining + ' dakika sonra tekrar deneyin.',
        locked: true,
        remaining_minutes: remaining
      });
    }
    // Kilit suresi dolmussa sifirla
    if (user.locked_until && new Date(user.locked_until) <= new Date()) {
      await userStore.update(user.id, { failed_login_count: 0, locked_until: null });
      user.failed_login_count = 0;
      user.locked_until = null;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const newCount = (user.failed_login_count || 0) + 1;
      const updateData = { failed_login_count: newCount };

      // Audit: basarisiz giris
      logAuditWithSeverity({
        tenant_id: user.tenant_id,
        user_id: user.id,
        username: user.username,
        entity_type: 'auth',
        entity_id: user.id,
        action: 'LOGIN_FAILED',
        severity: 'WARNING',
        detail: 'Basarisiz giris denemesi (' + newCount + '/' + MAX_LOGIN_ATTEMPTS + ')',
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });

      if (newCount >= MAX_LOGIN_ATTEMPTS) {
        updateData.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
        // Audit: hesap kilitlendi
        logAuditWithSeverity({
          tenant_id: user.tenant_id,
          user_id: user.id,
          username: user.username,
          entity_type: 'auth',
          entity_id: user.id,
          action: 'ACCOUNT_LOCKED',
          severity: 'ERROR',
          detail: MAX_LOGIN_ATTEMPTS + ' basarisiz deneme — ' + LOCKOUT_MINUTES + ' dakika kilitlendi',
          ip_address: req.ip,
          user_agent: req.headers['user-agent']
        });
        // Email bildirimi
        emailService.sendAccountLocked(user).catch(() => {});
      }

      await userStore.update(user.id, updateData);

      if (newCount >= MAX_LOGIN_ATTEMPTS) {
        return res.status(423).json({
          error: 'Hesab\u0131n\u0131z kilitlendi. ' + LOCKOUT_MINUTES + ' dakika sonra tekrar deneyin.',
          locked: true,
          remaining_minutes: LOCKOUT_MINUTES
        });
      }
      return res.status(401).json({ error: 'Ge\u00e7ersiz kullan\u0131c\u0131 ad\u0131 veya \u015fifre' });
    }

    const tenant = await tenantStore.findById(user.tenant_id);
    if (!tenant || !tenant.is_active) {
      return res.status(403).json({ error: '\u015eirket hesab\u0131 devre d\u0131\u015f\u0131' });
    }

    // Basarili giris — sayaclari sifirla
    await userStore.update(user.id, {
      last_login_at: new Date().toISOString(),
      failed_login_count: 0,
      locked_until: null
    });

    // Audit: basarili giris
    logAuditWithSeverity({
      tenant_id: user.tenant_id,
      user_id: user.id,
      username: user.username,
      entity_type: 'auth',
      entity_id: user.id,
      action: 'LOGIN',
      severity: 'INFO',
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    });

    const payload = {
      user_id: user.id,
      tenant_id: user.tenant_id,
      tenant_code: tenant.code,
      tenant_name: tenant.name,
      tenant_domain: tenant.domain || null,
      role: user.role,
      is_super_admin: user.is_super_admin || false,
      is_system_tenant: tenant.is_system_tenant || false,
      username: user.username,
      display_name: user.display_name || user.username,
      email: user.email || null
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Refresh token olustur
    const refreshTokenRaw = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, refreshTokenHash, refreshExpiresAt, req.ip, req.headers['user-agent'] || null]
    );

    logger.info('User login', { username: user.username, tenant: tenant.code, role: user.role });

    res.json({
      token,
      refreshToken: refreshTokenRaw,
      tokenExpiresIn: JWT_EXPIRES_IN,
      must_change_password: user.must_change_password || false,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        email: user.email,
        role: user.role,
        is_super_admin: user.is_super_admin,
        tenant_id: user.tenant_id,
        tenant_code: tenant.code,
        tenant_name: tenant.name
      }
    });
  } catch (err) {
    logger.error('Login error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   POST /api/auth/refresh — Token rotation
   ═══════════════════════════════════════════ */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken gerekli' });
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Gecerli refresh token bul
    const { rows } = await query(
      `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Gecersiz veya suresi dolmus refresh token' });
    }

    const rt = rows[0];

    // Eski token'i revoke et (rotation)
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [rt.id]);

    // Kullaniciyi dogrula
    const user = await userStore.findById(rt.user_id);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Kullanici aktif degil' });
    }

    const tenant = await tenantStore.findById(user.tenant_id);
    if (!tenant || !tenant.is_active) {
      return res.status(401).json({ error: 'Tenant aktif degil' });
    }

    // Yeni access token
    const payload = {
      user_id: user.id,
      tenant_id: user.tenant_id,
      tenant_code: tenant.code,
      tenant_name: tenant.name,
      tenant_domain: tenant.domain || null,
      role: user.role,
      is_super_admin: user.is_super_admin || false,
      is_system_tenant: tenant.is_system_tenant || false,
      username: user.username,
      display_name: user.display_name || user.username,
      email: user.email || null
    };
    const newToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Yeni refresh token
    const newRefreshRaw = crypto.randomBytes(40).toString('hex');
    const newRefreshHash = crypto.createHash('sha256').update(newRefreshRaw).digest('hex');
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)`,
      [user.id, newRefreshHash, newExpiresAt, req.ip, req.headers['user-agent'] || null]
    );

    res.json({
      token: newToken,
      refreshToken: newRefreshRaw,
      tokenExpiresIn: JWT_EXPIRES_IN
    });
  } catch (err) {
    logger.error('Refresh token error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   POST /api/auth/logout — Revoke all refresh tokens
   ═══════════════════════════════════════════ */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const result = await query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [req.user.user_id]
    );
    logger.info('User logout — revoked refresh tokens', { user_id: req.user.user_id, count: result.rowCount });
    res.json({ success: true, revoked: result.rowCount });
  } catch (err) {
    logger.error('Logout error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   GET /api/auth/me
   ═══════════════════════════════════════════ */
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token gerekli' });
    }
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await userStore.findById(decoded.user_id);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Kullanıcı devre dışı' });
    }

    res.json({
      user: {
        id: decoded.user_id,
        username: decoded.username,
        display_name: decoded.display_name,
        email: decoded.email,
        role: decoded.role,
        is_super_admin: decoded.is_super_admin,
        tenant_id: decoded.tenant_id,
        tenant_code: decoded.tenant_code,
        tenant_name: decoded.tenant_name
      }
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token süresi dolmuş' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Geçersiz token' });
    }
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   PUT /api/auth/password
   ═══════════════════════════════════════════ */
router.put('/password', authenticate, async (req, res) => {
  try {
    const { current_password, new_password, force_change } = req.body;
    if (!new_password) {
      return res.status(400).json({ error: 'Yeni \u015fifre gerekli' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: '\u015eifre en az 6 karakter olmal\u0131' });
    }

    const user = await userStore.findById(req.user.user_id);
    if (!user) return res.status(404).json({ error: 'Kullan\u0131c\u0131 bulunamad\u0131' });

    // must_change_password durumunda current_password gerekmez
    if (!force_change && !user.must_change_password) {
      if (!current_password) {
        return res.status(400).json({ error: 'Mevcut \u015fifre gerekli' });
      }
      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Mevcut \u015fifre yanl\u0131\u015f' });
      }
    }

    const hash = await bcrypt.hash(new_password, 10);
    await userStore.update(user.id, {
      password_hash: hash,
      must_change_password: false
    });

    logAudit(req, 'user', user.id, 'PASSWORD_CHANGE', null, { username: user.username });
    logger.info('Password changed', { username: user.username });
    res.json({ message: '\u015eifre de\u011fi\u015ftirildi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   POST /api/auth/forgot-password
   ═══════════════════════════════════════════ */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'E-posta adresi gerekli' });
    }

    const users = await userStore.readAll({ filter: { email: email.toLowerCase() } });
    const user = users[0];
    if (!user || !user.is_active) {
      return res.json({ message: 'E-posta adresinize sıfırlama linki gönderildi' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await userStore.update(user.id, {
      password_reset_token: resetToken,
      password_reset_expires: resetExpires
    });

    // E-posta gonder (SMTP yapilandirildiysa)
    emailService.sendPasswordReset(user, resetToken).catch(() => {});
    logger.info('Password reset requested', {
      username: user.username,
      email: user.email
    });

    res.json({ message: 'E-posta adresinize sıfırlama linki gönderildi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   POST /api/auth/reset-password
   ═══════════════════════════════════════════ */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) {
      return res.status(400).json({ error: 'Token ve yeni şifre gerekli' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });
    }

    const users = await userStore.readAll({ filter: { password_reset_token: token } });
    const user = users[0];
    if (!user) {
      return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş token' });
    }

    if (new Date(user.password_reset_expires) < new Date()) {
      return res.status(400).json({ error: 'Token süresi dolmuş. Yeniden talep edin.' });
    }

    const hash = await bcrypt.hash(new_password, 10);
    await userStore.update(user.id, {
      password_hash: hash,
      password_reset_token: null,
      password_reset_expires: null,
      must_change_password: false
    });

    // Audit: sifre sifirlama tamamlandi
    logAuditWithSeverity({
      tenant_id: user.tenant_id,
      user_id: user.id,
      username: user.username,
      entity_type: 'user',
      entity_id: user.id,
      action: 'PASSWORD_RESET_COMPLETED',
      severity: 'INFO',
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    });

    logger.info('Password reset completed', { username: user.username });
    res.json({ message: '\u015eifre ba\u015far\u0131yla s\u0131f\u0131rland\u0131' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   POST /api/auth/send-reset — Admin tetiklemeli
   ═══════════════════════════════════════════ */
router.post('/send-reset', authenticate, requireRole('TENANT_ADMIN'), async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'user_id gerekli' });
    }

    const targetUser = await userStore.findById(user_id);
    if (!targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    if (req.userRole !== 'SUPER_ADMIN' && targetUser.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Farklı şirketin kullanıcısı' });
    }

    if (!targetUser.email) {
      return res.status(400).json({ error: 'Kullanıcının e-posta adresi tanımlı değil' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await userStore.update(user_id, {
      password_reset_token: resetToken,
      password_reset_expires: resetExpires
    });

    // E-posta gonder
    emailService.sendPasswordReset(targetUser, resetToken).catch(() => {});
    logger.info('Admin triggered password reset', {
      admin: req.user.username,
      target_user: targetUser.username,
      email: targetUser.email
    });

    logAudit(req, 'user', user_id, 'ADMIN_PASSWORD_RESET', null, {
      target_username: targetUser.username,
      target_email: targetUser.email
    });

    res.json({ message: 'Şifre sıfırlama maili gönderildi: ' + targetUser.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   POST /api/auth/impersonate — Yerine geçme
   ═══════════════════════════════════════════ */
router.post('/impersonate', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { tenant_id } = req.body;
    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id gerekli' });
    }

    const tenant = await tenantStore.findById(tenant_id);
    if (!tenant || !tenant.is_active) {
      return res.status(404).json({ error: 'Şirket bulunamadı veya devre dışı' });
    }

    const payload = {
      user_id: req.user.user_id,
      tenant_id: tenant.id,
      tenant_code: tenant.code,
      tenant_name: tenant.name,
      role: 'SUPER_ADMIN',
      is_super_admin: true,
      username: req.user.username,
      display_name: req.user.display_name,
      email: req.user.email,
      impersonating: true,
      original_tenant_id: req.user.tenant_id,
      original_tenant_code: req.user.tenant_code
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    logAudit(req, 'impersonation', tenant.id, 'IMPERSONATE_START', null, {
      admin: req.user.username,
      target_tenant: tenant.code
    });

    logger.info('Impersonation started', { admin: req.user.username, target_tenant: tenant.code });

    res.json({
      token,
      tenant: { id: tenant.id, code: tenant.code, name: tenant.name },
      message: tenant.name + ' şirketi olarak işlem yapıyorsunuz'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   POST /api/auth/stop-impersonation
   ═══════════════════════════════════════════ */
router.post('/stop-impersonation', authenticate, async (req, res) => {
  try {
    if (!req.user.impersonating) {
      return res.status(400).json({ error: 'Aktif impersonation yok' });
    }

    const originalTenant = await tenantStore.findById(req.user.original_tenant_id);

    const payload = {
      user_id: req.user.user_id,
      tenant_id: req.user.original_tenant_id,
      tenant_code: req.user.original_tenant_code,
      tenant_name: originalTenant ? originalTenant.name : '',
      role: 'SUPER_ADMIN',
      is_super_admin: true,
      username: req.user.username,
      display_name: req.user.display_name,
      email: req.user.email
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    logAudit(req, 'impersonation', req.user.tenant_id, 'IMPERSONATE_STOP', null, {
      admin: req.user.username
    });

    res.json({ token, message: 'Yerine geçme sonlandırıldı' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   TENANT CRUD — SUPER_ADMIN only
   ═══════════════════════════════════════════ */
router.get('/tenants', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const tenants = await tenantStore.readAll();
    res.json({ data: tenants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/tenants/stats — Tum tenant'lar icin ozet istatistikler
 */
router.get('/tenants/stats', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { query: dbQ } = require('../../shared/database/pool');

    // Tek sorguda tum istatistikleri al
    const sql = `
      SELECT
        t.id AS tenant_id,
        -- Kullanici istatistikleri
        COALESCE(u.total_users, 0)::int        AS total_users,
        COALESCE(u.active_users, 0)::int       AS active_users,
        COALESCE(u.inactive_users, 0)::int     AS inactive_users,
        -- Is emri istatistikleri
        COALESCE(wo.total_orders, 0)::int      AS total_orders,
        COALESCE(wo.open_orders, 0)::int       AS open_orders,
        COALESCE(wo.completed_orders, 0)::int  AS completed_orders,
        COALESCE(wo.failed_orders, 0)::int     AS failed_orders,
        -- Islem istatistikleri
        COALESCE(tx.total_transactions, 0)::int   AS total_transactions,
        COALESCE(tx.success_transactions, 0)::int AS success_transactions,
        COALESCE(tx.failed_transactions, 0)::int  AS failed_transactions,
        -- Yapilandirma istatistikleri
        COALESCE(wh.warehouse_count, 0)::int   AS warehouse_count,
        COALESCE(fm.field_mapping_count, 0)::int AS field_mapping_count,
        COALESCE(sp.security_profile_count, 0)::int AS security_profile_count,
        -- Son aktivite
        u.last_login,
        wo.last_order_at
      FROM tenants t
      LEFT JOIN (
        SELECT tenant_id,
          COUNT(*) AS total_users,
          COUNT(*) FILTER (WHERE is_active = true) AS active_users,
          COUNT(*) FILTER (WHERE is_active = false) AS inactive_users,
          MAX(last_login_at) AS last_login
        FROM users GROUP BY tenant_id
      ) u ON u.tenant_id = t.id
      LEFT JOIN (
        SELECT tenant_id,
          COUNT(*) AS total_orders,
          COUNT(*) FILTER (WHERE status IN ('RECEIVED','SENT_TO_WMS','IN_PROGRESS','PARTIALLY_DONE')) AS open_orders,
          COUNT(*) FILTER (WHERE status IN ('COMPLETED','GR_POSTED','PGI_POSTED','SAP_POSTED')) AS completed_orders,
          COUNT(*) FILTER (WHERE status IN ('DISPATCH_FAILED','FAILED','ERROR')) AS failed_orders,
          MAX(created_at) AS last_order_at
        FROM work_orders GROUP BY tenant_id
      ) wo ON wo.tenant_id = t.id
      LEFT JOIN (
        SELECT tenant_id,
          COUNT(*) AS total_transactions,
          COUNT(*) FILTER (WHERE status = 'SUCCESS') AS success_transactions,
          COUNT(*) FILTER (WHERE status IN ('FAILED','DEAD')) AS failed_transactions
        FROM transaction_logs GROUP BY tenant_id
      ) tx ON tx.tenant_id = t.id
      LEFT JOIN (
        SELECT tenant_id, COUNT(*) AS warehouse_count
        FROM warehouses WHERE is_active = true GROUP BY tenant_id
      ) wh ON wh.tenant_id = t.id
      LEFT JOIN (
        SELECT tenant_id, COUNT(*) AS field_mapping_count
        FROM field_mappings WHERE is_active = true GROUP BY tenant_id
      ) fm ON fm.tenant_id = t.id
      LEFT JOIN (
        SELECT tenant_id, COUNT(*) AS security_profile_count
        FROM security_profiles WHERE is_active = true GROUP BY tenant_id
      ) sp ON sp.tenant_id = t.id
      ORDER BY t.created_at ASC
    `;

    const { rows } = await dbQ(sql);

    // tenant_id -> stats map
    const stats = {};
    rows.forEach(r => {
      stats[r.tenant_id] = {
        total_users: r.total_users,
        active_users: r.active_users,
        inactive_users: r.inactive_users,
        total_orders: r.total_orders,
        open_orders: r.open_orders,
        completed_orders: r.completed_orders,
        failed_orders: r.failed_orders,
        total_transactions: r.total_transactions,
        success_transactions: r.success_transactions,
        failed_transactions: r.failed_transactions,
        warehouse_count: r.warehouse_count,
        field_mapping_count: r.field_mapping_count,
        security_profile_count: r.security_profile_count,
        last_login: r.last_login,
        last_order_at: r.last_order_at
      };
    });

    res.json({ data: stats });
  } catch (err) {
    logger.error('GET /tenants/stats error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/tenants', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { code, name, domain, tax_id, tax_office, address, iban, contact_person, phone, plan, title, admin_user } = req.body;

    if (!name || !domain) {
      return res.status(400).json({
        error: 'Zorunlu alanlar: name, domain'
      });
    }

    // Şirket kodu: boşsa domain/isimden üret, doluysa da benzersizlik kontrol et
    const existing = await tenantStore.readAll();
    const codes = new Set(existing.map(t => t.code));

    let finalCode = (code || '').trim().toUpperCase();
    if (!finalCode) {
      // domain'in ilk kısmını al (tesla.com → TESLA)
      const domainBase = domain.split('.')[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
      finalCode = domainBase || name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
    }

    // Benzersizlik kontrolü — çakışırsa sayı ekle
    let candidate = finalCode;
    let suffix = 2;
    while (codes.has(candidate)) {
      candidate = finalCode + '_' + suffix;
      suffix++;
    }
    finalCode = candidate;

    // Admin user varsa username benzersizliğini önceden kontrol et
    if (admin_user && admin_user.username) {
      const existingUser = await query(
        'SELECT id FROM users WHERE username = $1', [admin_user.username]
      );
      if (existingUser.rows.length > 0) {
        return res.status(409).json({ error: 'Bu kullanıcı adı zaten mevcut: ' + admin_user.username });
      }
    }

    const tenant = await tenantStore.create({
      code: finalCode,
      name,
      title: title || name,
      domain: domain.toLowerCase(),
      tax_id: tax_id || null,
      tax_office: tax_office || null,
      address: address || null,
      iban: iban || null,
      contact_person: contact_person || null,
      phone: phone || null,
      plan: plan || 'standard'
    });

    logAudit(req, 'tenant', tenant.id, 'CREATE', null, tenant);

    let adminResult = null;
    if (admin_user && admin_user.username && admin_user.email) {
      // Rastgele geçici şifre oluştur (kullanıcı bunu bilmeyecek)
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const hash = await bcrypt.hash(tempPassword, 10);

      // Password reset token oluştur
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 saat

      adminResult = await userStore.create({
        tenant_id: tenant.id,
        username: admin_user.username,
        password_hash: hash,
        display_name: admin_user.display_name || admin_user.username,
        email: admin_user.email,
        role: 'TENANT_ADMIN',
        is_active: true,
        must_change_password: true,
        password_reset_token: resetToken,
        password_reset_expires: resetExpires
      });

      logAudit(req, 'user', adminResult.id, 'CREATE', null, {
        username: adminResult.username, role: 'TENANT_ADMIN', tenant: tenant.code
      });

      // Hesap kurulum e-postası gönder
      try {
        await emailService.sendPasswordReset(admin_user.email, resetToken);
        logger.info('Admin setup email sent', { email: admin_user.email, tenant: tenant.code });
      } catch (emailErr) {
        logger.warn('Admin setup email failed', { email: admin_user.email, error: emailErr.message });
      }
    }

    // Default rolleri oluştur (REDIGO referans tenant'ından kopyala, SUPER_ADMIN hariç)
    try {
      const refRoles = await query(
        "SELECT code, name, permissions FROM roles WHERE tenant_id = (SELECT id FROM tenants WHERE is_system_tenant = true LIMIT 1) AND code != 'SUPER_ADMIN'"
      );
      for (const role of refRoles.rows) {
        await query(
          'INSERT INTO roles (id, tenant_id, code, name, permissions) VALUES (gen_random_uuid(), $1, $2, $3, $4)',
          [tenant.id, role.code, role.name, JSON.stringify(role.permissions)]
        );
      }
      logger.info('Default roles created', { tenant: tenant.code, count: refRoles.rows.length });
    } catch (roleErr) {
      logger.warn('Default role creation failed', { tenant: tenant.code, error: roleErr.message });
    }

    logger.info('Tenant created', { code: tenant.code, by: req.user.username });

    res.status(201).json({
      tenant,
      admin: adminResult ? {
        id: adminResult.id,
        username: adminResult.username,
        role: adminResult.role
      } : null
    });
  } catch (err) {
    if (err.message && err.message.includes('duplicate key')) {
      const detail = err.detail || '';
      if (detail.includes('code')) {
        return res.status(409).json({ error: 'Bu şirket kodu zaten mevcut: ' + finalCode });
      }
      if (detail.includes('username')) {
        return res.status(409).json({ error: 'Bu kullanıcı adı zaten mevcut' });
      }
      return res.status(409).json({ error: 'Çakışan kayıt: ' + detail });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/tenants/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const tenant = await tenantStore.findById(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Şirket bulunamadı' });

    const updates = {};
    const allowed = ['name', 'title', 'domain', 'tax_id', 'tax_office', 'address', 'iban', 'contact_person', 'phone', 'plan', 'is_active'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const updated = await tenantStore.update(req.params.id, updates);
    logAudit(req, 'tenant', req.params.id, 'UPDATE', tenant, updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /tenants/:id — sadece is gormemis tenant silinebilir
router.delete('/tenants/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const tenant = await tenantStore.findById(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Şirket bulunamadı' });

    // Sistem tenant'i (REDIGO) silinemez
    if (tenant.code === 'REDIGO') {
      return res.status(403).json({ error: 'Sistem şirketi silinemez' });
    }

    // Aktivite kontrolu: is emri, transaction, kullanici var mi?
    const { query } = require('../../shared/database/pool');
    const woCount = await query('SELECT count(*)::int as cnt FROM work_orders WHERE tenant_id = $1', [req.params.id]);
    const txCount = await query('SELECT count(*)::int as cnt FROM transaction_logs WHERE tenant_id = $1', [req.params.id]);

    if (woCount.rows[0].cnt > 0 || txCount.rows[0].cnt > 0) {
      return res.status(409).json({
        error: 'Bu şirketin iş emirleri veya işlem geçmişi bulunduğu için silinemez. Pasif yapabilirsiniz.',
        work_orders: woCount.rows[0].cnt,
        transactions: txCount.rows[0].cnt
      });
    }

    // Once bu tenant'a ait kullanicilari sil
    await query('DELETE FROM users WHERE tenant_id = $1', [req.params.id]);
    // Sonra tenant'i sil
    await tenantStore.remove(req.params.id);

    logAudit(req, 'tenant', req.params.id, 'DELETE', tenant, null);
    res.json({ success: true, message: 'Şirket silindi: ' + tenant.code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   USER CRUD — TENANT_ADMIN + SUPER_ADMIN
   ═══════════════════════════════════════════ */
router.get('/users', authenticate, requireRole('TENANT_ADMIN'), async (req, res) => {
  try {
    let filter = {};
    if (req.userRole === 'TENANT_ADMIN') {
      filter.tenant_id = req.tenantId;
    } else if (req.user && req.user.is_super_admin && req.user.impersonating) {
      filter.tenant_id = req.user.tenant_id;
    }

    const users = await userStore.readAll({ filter });
    const tenants = await tenantStore.readAll();
    const tenantMap = {};
    tenants.forEach(t => { tenantMap[t.id] = t; });

    const data = users.map(u => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      email: u.email,
      role: u.role,
      is_super_admin: u.is_super_admin,
      is_active: u.is_active,
      tenant_id: u.tenant_id,
      tenant_code: tenantMap[u.tenant_id] ? tenantMap[u.tenant_id].code : '',
      tenant_name: tenantMap[u.tenant_id] ? tenantMap[u.tenant_id].name : '',
      last_login_at: u.last_login_at,
      created_at: u.created_at
    }));

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', authenticate, requireRole('TENANT_ADMIN'), async (req, res) => {
  try {
    const { username, password, display_name, email, role, tenant_id, is_super_admin } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Kullanıcı adı gerekli' });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });
    }
    // Şifre verilmezse rastgele oluştur + ilk girişte değiştirme zorunlu
    const effectivePassword = password || require('crypto').randomBytes(16).toString('hex');
    const mustChangePassword = !password;

    const effectiveRole = role || 'TENANT_USER';
    const effectiveTenantId = req.userRole === 'SUPER_ADMIN'
      ? (tenant_id || req.tenantId)
      : req.tenantId;

    if (req.userRole === 'TENANT_ADMIN' && effectiveRole !== 'TENANT_USER') {
      return res.status(403).json({ error: 'Sadece Şirket Kullanıcısı oluşturabilirsiniz' });
    }

    let superFlag = false;
    if (effectiveRole === 'SUPER_ADMIN' || is_super_admin === true) {
      if (req.user.is_super_admin !== true) {
        return res.status(403).json({ error: 'SUPER_ADMIN yetkisi atanamaz' });
      }
      if (!validateSuperAdminEmail(email)) {
        return res.status(400).json({
          error: 'Süper Admin için ' + SUPER_ADMIN_DOMAIN + ' uzantılı e-posta zorunludur'
        });
      }
      superFlag = true;
    }

    const hash = await bcrypt.hash(effectivePassword, 10);
    const user = await userStore.create({
      tenant_id: effectiveTenantId,
      username,
      password_hash: hash,
      display_name: display_name || username,
      email: email ? email.toLowerCase() : null,
      role: effectiveRole,
      is_super_admin: superFlag,
      is_active: true,
      must_change_password: mustChangePassword
    });

    logAudit(req, 'user', user.id, 'CREATE', null, {
      username, role: effectiveRole, tenant_id: effectiveTenantId
    });
    logger.info('User created', { username, role: effectiveRole, by: req.user.username });

    res.status(201).json({
      id: user.id, username: user.username, email: user.email,
      role: user.role, is_super_admin: user.is_super_admin, tenant_id: user.tenant_id
    });
  } catch (err) {
    if (err.message && err.message.includes('duplicate key')) {
      return res.status(409).json({ error: 'Bu kullanıcı adı veya e-posta zaten mevcut' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id', authenticate, requireRole('TENANT_ADMIN'), async (req, res) => {
  try {
    const targetUser = await userStore.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    if (req.userRole === 'TENANT_ADMIN' && targetUser.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Farklı şirketin kullanıcısı düzenlenemez' });
    }

    const updates = {};
    if (req.body.display_name !== undefined) updates.display_name = req.body.display_name;
    if (req.body.email !== undefined) updates.email = req.body.email ? req.body.email.toLowerCase() : null;
    if (req.body.is_active !== undefined) updates.is_active = req.body.is_active;

    if (req.body.role !== undefined) {
      if (req.userRole === 'TENANT_ADMIN' && req.body.role !== 'TENANT_USER') {
        return res.status(403).json({ error: 'Sadece TENANT_USER rolü atanabilir' });
      }
      if (req.body.role === 'SUPER_ADMIN' && req.user.is_super_admin !== true) {
        return res.status(403).json({ error: 'SUPER_ADMIN rolü atanamaz' });
      }
      if (req.body.role === 'SUPER_ADMIN' && !validateSuperAdminEmail(req.body.email || targetUser.email)) {
        return res.status(400).json({
          error: 'SUPER_ADMIN için ' + SUPER_ADMIN_DOMAIN + ' uzantılı e-posta zorunludur'
        });
      }
      updates.role = req.body.role;
      if (req.body.role === 'SUPER_ADMIN') updates.is_super_admin = true;
    }

    if (req.body.is_super_admin !== undefined && req.user.is_super_admin === true) {
      if (req.body.is_super_admin === true && !validateSuperAdminEmail(req.body.email || targetUser.email)) {
        return res.status(400).json({
          error: 'Süper Admin için ' + SUPER_ADMIN_DOMAIN + ' uzantılı e-posta zorunludur'
        });
      }
      updates.is_super_admin = req.body.is_super_admin;
    }

    if (req.body.password) {
      if (req.body.password.length < 6) {
        return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });
      }
      updates.password_hash = await bcrypt.hash(req.body.password, 10);
    }

    const updated = await userStore.update(req.params.id, updates);
    logAudit(req, 'user', req.params.id, 'UPDATE', targetUser, updated);
    logger.info('User updated', { username: targetUser.username, by: req.user.username });

    res.json({
      id: updated.id, username: updated.username, email: updated.email,
      role: updated.role, is_super_admin: updated.is_super_admin, is_active: updated.is_active
    });
  } catch (err) {
    if (err.message && err.message.includes('duplicate key')) {
      return res.status(409).json({ error: 'Bu e-posta zaten mevcut' });
    }
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   POST /api/auth/logout
   ═══════════════════════════════════════════ */
router.post('/logout', authenticate, async (req, res) => {
  try {
    logAuditWithSeverity({
      tenant_id: req.tenantId,
      user_id: req.user.user_id,
      username: req.user.username,
      entity_type: 'auth',
      entity_id: req.user.user_id,
      action: 'LOGOUT',
      severity: 'INFO',
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    });
    logger.info('User logout', { username: req.user.username });
    res.json({ message: 'ok' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   POST /api/auth/unlock-account
   ═══════════════════════════════════════════ */
router.post('/unlock-account', authenticate, requireRole('TENANT_ADMIN'), async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'user_id gerekli' });
    }

    const targetUser = await userStore.findById(user_id);
    if (!targetUser) return res.status(404).json({ error: 'Kullan\u0131c\u0131 bulunamad\u0131' });

    if (req.userRole !== 'SUPER_ADMIN' && targetUser.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Farkl\u0131 \u015firketin kullan\u0131c\u0131s\u0131' });
    }

    await userStore.update(user_id, {
      failed_login_count: 0,
      locked_until: null
    });

    logAuditWithSeverity({
      tenant_id: req.tenantId,
      user_id: req.user.user_id,
      username: req.user.username,
      entity_type: 'user',
      entity_id: user_id,
      action: 'ACCOUNT_UNLOCKED',
      severity: 'INFO',
      detail: 'Hesap kilidi a\u00e7\u0131ld\u0131: ' + targetUser.username,
      new_values: { target_username: targetUser.username },
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    });

    logger.info('Account unlocked', { target: targetUser.username, by: req.user.username });
    res.json({ message: 'Hesap kilidi a\u00e7\u0131ld\u0131' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   GET /api/auth/audit-logs
   ═══════════════════════════════════════════ */
router.get('/audit-logs', authenticate, requireRole('TENANT_ADMIN'), async (req, res) => {
  try {
    const { query: dbQuery } = require('../../shared/database/pool');
    const filter = tenantFilter(req);
    const conditions = [];
    const params = [];
    let idx = 1;

    // Tenant filtresi
    if (filter.tenant_id) {
      conditions.push('tenant_id = $' + idx++);
      params.push(filter.tenant_id);
    }
    // Entity type filtresi
    if (req.query.entity_type) {
      conditions.push('entity_type = $' + idx++);
      params.push(req.query.entity_type);
    }
    // Action filtresi
    if (req.query.action) {
      conditions.push('action = $' + idx++);
      params.push(req.query.action);
    }
    // Severity filtresi
    if (req.query.severity) {
      conditions.push('severity = $' + idx++);
      params.push(req.query.severity);
    }
    // Tarih araligi
    if (req.query.date_from) {
      conditions.push('created_at >= $' + idx++);
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      conditions.push('created_at <= $' + idx++);
      params.push(req.query.date_to);
    }
    // Search (username, action, entity_type, entity_id, detail)
    if (req.query.search) {
      const searchTerm = '%' + req.query.search + '%';
      conditions.push('(username ILIKE $' + idx + ' OR action ILIKE $' + idx + ' OR entity_type ILIKE $' + idx + ' OR CAST(entity_id AS TEXT) ILIKE $' + idx + ' OR detail ILIKE $' + idx + ')');
      params.push(searchTerm);
      idx++;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = Number(req.query.limit) || 100;
    const offset = Number(req.query.offset) || 0;

    const sql = 'SELECT * FROM audit_logs ' + where + ' ORDER BY created_at DESC LIMIT $' + idx++ + ' OFFSET $' + idx++;
    params.push(limit, offset);

    const result = await dbQuery(sql, params);

    // Toplam sayiyi al (sayfalama icin)
    const countSql = 'SELECT COUNT(*) as total FROM audit_logs ' + where;
    const countResult = await dbQuery(countSql, params.slice(0, params.length - 2));

    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
      limit,
      offset
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   Roller ve Yetkiler (Roles & Permissions)
   ═══════════════════════════════════════════ */
const { PERMISSIONS, GROUPS, DEFAULTS } = require('../../shared/utils/permissions');
const roleStore = new DbStore('roles');

// GET /api/auth/permissions/definitions — Yetki tanimlari (sabit)
router.get('/permissions/definitions', authenticate, requireRole('TENANT_ADMIN'), (req, res) => {
  res.json({ permissions: PERMISSIONS, groups: GROUPS, defaults: DEFAULTS });
});

// GET /api/auth/roles — Tenant'in tum rollerini getir
router.get('/roles', authenticate, requireRole('TENANT_ADMIN'), async (req, res) => {
  try {
    const roles = await roleStore.readAll({ filter: { tenant_id: req.tenantId } });
    res.json({ data: roles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/roles — Yeni rol olustur
router.post('/roles', authenticate, requireRole('TENANT_ADMIN'), async (req, res) => {
  try {
    const { code, name, description, permissions } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Rol kodu ve adı gerekli' });
    }
    // Sistem rol kodlarini engelle
    if (['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_USER'].includes(code.toUpperCase())) {
      return res.status(400).json({ error: 'Sistem rol kodları kullanılamaz' });
    }
    // tenants.manage her zaman false (ozel roller icin)
    const safePerms = { ...(permissions || DEFAULTS.TENANT_USER) };
    safePerms['tenants.manage'] = false;

    const role = await roleStore.create({
      tenant_id: req.tenantId,
      code: code.toUpperCase(),
      name,
      description: description || null,
      is_system: false,
      permissions: safePerms
    });
    logAudit(req, 'role', role.id, 'CREATE', null, { code, name });
    res.json({ data: role });
  } catch (err) {
    if (err.message && err.message.includes('unique')) {
      return res.status(409).json({ error: 'Bu rol kodu zaten mevcut' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/roles/:id — Rol guncelle (yetkiler dahil)
router.put('/roles/:id', authenticate, requireRole('TENANT_ADMIN'), async (req, res) => {
  try {
    const role = await roleStore.findById(req.params.id);
    if (!role) return res.status(404).json({ error: 'Rol bulunamadı' });
    if (role.tenant_id !== req.tenantId && req.userRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Yetkiniz yok' });
    }
    // SUPER_ADMIN yetkisi degistirilemez
    if (role.code === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Süper Admin yetkileri değiştirilemez' });
    }
    // TENANT_ADMIN: users.view + users.manage her zaman true
    const { name, description, permissions } = req.body;
    const safePerms = { ...(permissions || role.permissions) };
    safePerms['tenants.manage'] = false;
    if (role.code === 'TENANT_ADMIN') {
      safePerms['users.view'] = true;
      safePerms['users.manage'] = true;
    }

    const updated = await roleStore.update(req.params.id, {
      name: name || role.name,
      description: description !== undefined ? description : role.description,
      permissions: safePerms
    });
    logAudit(req, 'role', req.params.id, 'UPDATE', role.permissions, safePerms);
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/roles/:id — Ozel rol sil
router.delete('/roles/:id', authenticate, requireRole('TENANT_ADMIN'), async (req, res) => {
  try {
    const role = await roleStore.findById(req.params.id);
    if (!role) return res.status(404).json({ error: 'Rol bulunamadı' });
    if (role.is_system) {
      return res.status(403).json({ error: 'Sistem rolleri silinemez' });
    }
    // Bu roldeki kullanici var mi?
    const usersWithRole = await userStore.readAll({ filter: { role: role.code, tenant_id: req.tenantId } });
    if (usersWithRole.length > 0) {
      return res.status(409).json({
        error: 'Bu role atanmış ' + usersWithRole.length + ' kullanıcı var. Önce rollerini değiştirin.'
      });
    }
    await roleStore.remove(req.params.id);
    logAudit(req, 'role', req.params.id, 'DELETE', role, null);
    res.json({ message: 'Rol silindi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/my-permissions — Login olan kullanicinin yetkileri
router.get('/my-permissions', authenticate, async (req, res) => {
  try {
    // SUPER_ADMIN her zaman tam yetkili
    if (req.user.is_super_admin) {
      return res.json({ data: DEFAULTS.SUPER_ADMIN });
    }
    const roles = await roleStore.readAll({ filter: { tenant_id: req.tenantId } });
    const myRole = roles.find(r => r.code === req.userRole);
    const perms = myRole ? myRole.permissions : (DEFAULTS[req.userRole] || DEFAULTS.TENANT_USER);

    // TENANT_ADMIN korumasi: users.view + users.manage her zaman acik
    if (req.userRole === 'TENANT_ADMIN') {
      perms['users.view'] = true;
      perms['users.manage'] = true;
    }

    res.json({ data: perms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.JWT_SECRET = JWT_SECRET;
