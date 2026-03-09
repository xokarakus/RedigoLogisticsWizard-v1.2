/**
 * Authentication & Authorization Middleware
 *
 * BTP'de: Approuter XSUAA JWT token → backend doğrular.
 * Local dev'de: Kendi JWT token sistemimiz (auth.js routes).
 */
const passport = require('passport');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'redigo-logistics-secret-key-change-in-production';
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
    return res.status(401).json({ error: 'Token gerekli' });
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
    res.status(403).json({ error: 'Yetersiz yetki: ' + scope + ' scope gerekli' });
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
    res.status(403).json({ error: 'Yetersiz yetki: ' + role + ' veya ustu gerekli' });
  };
}

/**
 * Super admin kontrolü.
 */
function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.is_super_admin === true) return next();
  res.status(403).json({ error: 'Super Admin yetkisi gerekli' });
}

/**
 * Platform admin kontrolü — hem SUPER_ADMIN hem de sistem tenant'ından olmalı.
 * Şirket yönetimi (tenant CRUD) için kullanılır.
 */
function requirePlatformAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.is_super_admin === true && req.user.is_system_tenant === true) return next();
  res.status(403).json({ error: 'Platform Admin yetkisi gerekli (sistem tenant + super admin)' });
}

/**
 * Tenant filtresi — super admin tüm tenant'ları görür, diğerleri sadece kendilerini.
 */
function tenantFilter(req) {
  if (!req.user) return {};
  if (req.user.is_super_admin) return {};
  return { tenant_id: req.user.tenant_id || req.tenantId };
}

/**
 * Super admin e-posta domain doğrulaması.
 */
function validateSuperAdminEmail(email) {
  if (!SUPER_ADMIN_DOMAIN || SUPER_ADMIN_DOMAIN === '@') return true;
  if (!email) return false;
  return email.toLowerCase().endsWith(SUPER_ADMIN_DOMAIN.toLowerCase());
}

module.exports = {
  setupAuth,
  authenticate,
  requireScope,
  requireRole,
  requireSuperAdmin,
  requirePlatformAdmin,
  tenantFilter,
  validateSuperAdminEmail,
  JWT_SECRET,
  SUPER_ADMIN_DOMAIN
};
