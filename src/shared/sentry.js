/**
 * Sentry Error Tracking
 *
 * SENTRY_DSN ortam degiskeni set edilmisse aktif olur.
 * Yoksa sessizce devre disi kalir (development ortami).
 */
const Sentry = require('@sentry/node');
const logger = require('./utils/logger');

const SENTRY_DSN = process.env.SENTRY_DSN || '';
let initialized = false;

function initSentry(app) {
  if (!SENTRY_DSN) {
    logger.info('Sentry disabled — SENTRY_DSN not set');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: 'redigo-logistics@1.2.0',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    integrations: [
      Sentry.httpIntegration({ tracing: true }),
      Sentry.expressIntegration({ app })
    ],
    beforeSend(event) {
      // PII temizligi: Authorization header'ini gizle
      if (event.request && event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
    ignoreErrors: [
      'ECONNREFUSED',
      'ECONNRESET',
      'Token gerekli',
      'Token suresi dolmus',
      'Gecersiz token'
    ]
  });

  initialized = true;
  logger.info('Sentry error tracking enabled');
}

/**
 * Sentry error handler middleware — centralized error handler'dan ONCE kullanilmali.
 */
function sentryErrorHandler() {
  if (!initialized) {
    return (err, req, res, next) => next(err);
  }
  return Sentry.setupExpressErrorHandler();
}

/**
 * Manuel hata raporlama (route handler'larin catch bloklarinda).
 */
function captureException(err, context = {}) {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context.user) scope.setUser(context.user);
    if (context.tenantId) scope.setTag('tenant_id', context.tenantId);
    if (context.correlationId) scope.setTag('correlation_id', context.correlationId);
    if (context.extra) scope.setExtras(context.extra);
    Sentry.captureException(err);
  });
}

module.exports = { initSentry, sentryErrorHandler, captureException };
