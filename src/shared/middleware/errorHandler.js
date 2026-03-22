/**
 * Centralized Error Handler Middleware
 *
 * Standardizes all error responses to:
 *   { error: string, message: string, correlationId: string }
 *
 * Sanitizes internal/DB errors so they don't leak to the client.
 */
const logger = require('../utils/logger');

const INTERNAL_PATTERNS = [
  /duplicate key value violates unique constraint/i,
  /violates foreign key constraint/i,
  /relation ".*" does not exist/i,
  /column ".*" does not exist/i,
  /syntax error at or near/i,
  /connection refused/i,
  /ECONNREFUSED/i,
  /timeout expired/i,
];

function sanitizeMessage(msg) {
  if (!msg) return 'Internal server error';
  for (const pattern of INTERNAL_PATTERNS) {
    if (pattern.test(msg)) {
      return 'Internal server error';
    }
  }
  return msg;
}

function errorHandler(err, req, res, _next) {
  const correlationId = req.correlationId || req.headers['x-correlation-id'] || '-';
  const status = err.status || err.statusCode || 500;

  // Log full error internally
  logger.error('Request error', {
    correlationId,
    status,
    error: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  });

  // Sanitize message for client (don't leak DB/internal details on 500s)
  const clientMessage = status >= 500
    ? sanitizeMessage(err.message)
    : err.message || 'An error occurred';

  res.status(status).json({
    error: clientMessage,
    message: clientMessage,
    correlationId,
  });
}

module.exports = errorHandler;
