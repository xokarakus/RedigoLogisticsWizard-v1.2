/**
 * XSUAA JWT Authentication & Authorization Middleware
 *
 * BTP'de: Approuter JWT token üretir → backend doğrular.
 * Local dev'de: VCAP_SERVICES yoksa → tüm auth skip edilir.
 */
const passport = require('passport');
const config = require('../config');
const logger = require('../utils/logger');

let authEnabled = false;

/**
 * Express app'e JWT doğrulama middleware'ini ekle.
 * config.xsuaa null ise (local dev) → skip.
 */
function setupAuth(app) {
  if (!config.xsuaa) {
    logger.info('XSUAA auth disabled (no VCAP_SERVICES)');
    return;
  }

  try {
    const xssec = require('@sap/xssec');
    passport.use('JWT', new xssec.JWTStrategy(config.xsuaa));
    app.use(passport.initialize());
    authEnabled = true;
    logger.info('XSUAA JWT auth enabled');
  } catch (err) {
    logger.error('XSUAA setup failed', { error: err.message });
  }
}

/**
 * JWT doğrulama middleware.
 * Auth kapalıysa geçir, açıksa token doğrula.
 */
function authenticate(req, res, next) {
  if (!authEnabled) return next();
  passport.authenticate('JWT', { session: false }, (err, user, info) => {
    if (err) return res.status(500).json({ error: 'Auth error' });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    req.authInfo = user;
    next();
  })(req, res, next);
}

/**
 * Scope kontrol middleware factory.
 * @param {string} scope — xs-security.json'daki scope adı (ör. 'Admin', 'Operator', 'Viewer')
 */
function requireScope(scope) {
  return (req, res, next) => {
    if (!authEnabled) return next(); // local dev
    if (!req.authInfo) return res.status(401).json({ error: 'Unauthorized' });
    const fullScope = config.xsuaa.xsappname + '.' + scope;
    if (req.authInfo.checkScope(fullScope)) return next();
    res.status(403).json({ error: 'Yetersiz yetki: ' + scope + ' scope gerekli' });
  };
}

module.exports = { setupAuth, authenticate, requireScope };
