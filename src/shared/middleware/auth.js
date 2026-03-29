/**
 * Authentication & Authorization Middleware
 *
 * BTP'de: Approuter XSUAA JWT token → backend doğrular.
 * Local dev'de: Kendi JWT token sistemimiz (auth.js routes).
 */
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config');
const logger = require('../utils/logger');
const { query } = require('../database/pool');

const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('JWT_SECRET environment variable is required in production'); })()
    : 'redigo-logistics-dev-secret-key'
);
const SUPER_ADMIN_DOMAIN = process.env.SUPER_ADMIN_DOMAIN || '@redigo.com';

let authEnabled = false;
let xsuaaEnabled = false;

/**
 * Express app'e JWT doğrulama middleware'ini ekle.
 * config.xsuaa null ise (local dev) → XSUAA skip, kendi JWT kullan.
 */
function setupAuth(app) {
  if (!config.xsuaa) {
    logger.info('XSUAA auth disabled — using local JWT auth');
    authEnabled = true;
    return;
  }

  try {
    const xssec = require('@sap/xssec');
    passport.use('JWT', new xssec.JWTStrategy(config.xsuaa));
    app.use(passport.initialize());
    authEnabled = true;
    xsuaaEnabled = true;
    logger.info('XSUAA JWT auth enabled');
  } catch (err) {
    logger.error('XSUAA setup failed, falling back to local JWT', { error: err.message });
    authEnabled = true;
  }
}

/**
 * JWT doğrulama middleware.
 * XSUAA aktifse XSUAA token doğrula, değilse kendi JWT doğrula.
 */
function authenticate(req, res, next) {
  if (!authEnabled) return next();

  if (xsuaaEnabled) {
    return passport.authenticate('JWT', { session: false }, (err, user, info) => {
      if (err) return res.status(500).json({ error: 'Auth error' });
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      req.user = user;
      req.authInfo = user;
      next();
    })(req, res, next);
  }

  // Local JWT auth
  var authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    var token = authHeader.substring(7);
    var decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.tenantId = decoded.tenant_id;
    req.userRole = decoded.role;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token suresi dolmus' });
    }
    return res.status(401).json({ error: 'Gecersiz token' });
  }
}

/**
 * Scope kontrol middleware factory (XSUAA).
 */
function requireScope(scope) {
  return (req, res, next) => {
    if (!xsuaaEnabled) return next();
    if (!req.authInfo) return res.status(401).json({ error: 'Unauthorized' });
    const fullScope = config.xsuaa.xsappname + '.' + scope;
    if (req.authInfo.checkScope(fullScope)) return next();
    res.status(403).json({ error: 'Insufficient permissions: ' + scope + ' scope required' });
  };
}

/**
 * Rol kontrol middleware factory (JWT).
 * Belirtilen rol veya daha yüksek seviye gerektirir.
 */
function requireRole(role) {
  var roleHierarchy = { 'TENANT_USER': 1, 'TENANT_ADMIN': 2, 'SUPER_ADMIN': 3 };
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    var userLevel = roleHierarchy[req.user.role] || 0;
    var requiredLevel = roleHierarchy[role] || 0;
    if (req.user.is_super_admin) userLevel = 3;
    if (userLevel >= requiredLevel) return next();
    res.status(403).json({ error: 'Insufficient permissions: ' + role + ' or higher required' });
  };
}

/**
 * Super admin kontrolü.
 */
function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.is_super_admin === true) return next();
  res.status(403).json({ error: 'Super Admin access required' });
}

/**
 * Platform admin kontrolü — hem SUPER_ADMIN hem de sistem tenant'ından olmalı.
 * Şirket yönetimi (tenant CRUD) için kullanılır.
 */
function requirePlatformAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.is_super_admin === true && req.user.is_system_tenant === true) return next();
  res.status(403).json({ error: 'Platform Admin access required' });
}

/**
 * Tenant filtresi — super admin tüm tenant'ları görür, diğerleri sadece kendilerini.
 */
function tenantFilter(req) {
  if (!req.user) return {};
  // Super admin impersonate modundaysa hedef tenant'ı filtrele
  if (req.user.is_super_admin && req.user.impersonating) {
    return { tenant_id: req.user.tenant_id };
  }
  if (req.user.is_super_admin) return {};
  return { tenant_id: req.user.tenant_id || req.tenantId };
}

/**
 * Super admin e-posta domain doğrulaması.
 */
/**
 * Servis kullanıcı kimlik doğrulama.
 * X-Service-Key ve X-Service-Secret header'larını kontrol eder.
 * Başarılıysa req.user, req.tenantId set eder ve usage_count artırır.
 */
async function authenticateServiceUser(req, res, next) {
  const serviceKey = req.headers['x-service-key'];
  const serviceSecret = req.headers['x-service-secret'];

  if (!serviceKey || !serviceSecret) {
    return res.status(401).json({ error: 'Service credentials required (X-Service-Key, X-Service-Secret)' });
  }

  try {
    // API key ile kullanıcıyı bul
    const result = await query(
      `SELECT su.*, t.code AS tenant_code, t.name AS tenant_name, t.is_active AS tenant_active
       FROM service_users su
       JOIN tenants t ON t.id = su.tenant_id
       WHERE su.api_key = $1`,
      [serviceKey]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid service credentials' });
    }

    const su = result.rows[0];

    // Aktiflik kontrolleri
    if (!su.is_active) {
      return res.status(403).json({ error: 'Service user is deactivated' });
    }
    if (!su.tenant_active) {
      return res.status(403).json({ error: 'Tenant is deactivated' });
    }

    // Süre dolum kontrolü
    if (su.expires_at && new Date(su.expires_at) < new Date()) {
      return res.status(403).json({ error: 'Service user credentials have expired' });
    }

    // Secret doğrula (bcrypt)
    const secretValid = await bcrypt.compare(serviceSecret, su.api_secret_hash);
    if (!secretValid) {
      return res.status(401).json({ error: 'Invalid service credentials' });
    }

    // Usage count artır (async, hata response'u engellemez)
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    query(
      'UPDATE service_users SET usage_count = usage_count + 1, last_used_at = NOW(), last_used_ip = $2 WHERE id = $1',
      [su.id, clientIp]
    ).catch(err => logger.warn('Service user usage update failed', { id: su.id, error: err.message }));

    // req.user set et
    req.user = {
      user_id: su.id,
      tenant_id: su.tenant_id,
      tenant_code: su.tenant_code,
      tenant_name: su.tenant_name,
      role: 'SERVICE_USER',
      is_super_admin: false,
      is_service_user: true,
      username: su.name,
      display_name: su.name,
      scopes: su.scopes || []
    };
    req.tenantId = su.tenant_id;
    req.userRole = 'SERVICE_USER';

    next();
  } catch (err) {
    logger.error('Service user auth error', { error: err.message });
    return res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Hibrit auth: Önce JWT dene, yoksa service user auth dene.
 * Her iki yöntemden biri başarılıysa devam et.
 */
function authenticateAny(req, res, next) {
  // Service key varsa direkt service user auth kullan
  if (req.headers['x-service-key']) {
    return authenticateServiceUser(req, res, next);
  }
  // Yoksa normal JWT auth
  return authenticate(req, res, next);
}

function validateSuperAdminEmail(email) {
  if (!SUPER_ADMIN_DOMAIN || SUPER_ADMIN_DOMAIN === '@') return true;
  if (!email) return false;
  return email.toLowerCase().endsWith(SUPER_ADMIN_DOMAIN.toLowerCase());
}

module.exports = {
  setupAuth,
  authenticate,
  authenticateServiceUser,
  authenticateAny,
  requireScope,
  requireRole,
  requireSuperAdmin,
  requirePlatformAdmin,
  tenantFilter,
  validateSuperAdminEmail,
  JWT_SECRET,
  SUPER_ADMIN_DOMAIN
};
