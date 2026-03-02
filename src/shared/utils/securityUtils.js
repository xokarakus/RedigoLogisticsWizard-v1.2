/**
 * Security utility — credential masking for API responses.
 *
 * Masks sensitive fields inside security profile `config` JSONB objects
 * before they leave the server. Internal consumers (httpDispatcher) read
 * directly from DbStore and always see real credentials.
 */

const SENSITIVE_KEYS = new Set([
  'client_secret',  // OAUTH2
  'api_key',        // API_KEY
  'password',       // BASIC
  'token',          // BEARER
  'key_value'       // PROCESS_KEY
]);

const MASK_VALUE = '******';

/**
 * Return a shallow copy of the profile with sensitive config values masked.
 * Non-sensitive keys (client_id, token_url, scope, header_name, username,
 * key_field, injection) pass through unchanged.
 */
function maskCredentials(profile) {
  if (!profile) return profile;
  const masked = { ...profile };
  if (masked.config && typeof masked.config === 'object') {
    const mc = { ...masked.config };
    for (const key of Object.keys(mc)) {
      if (SENSITIVE_KEYS.has(key)) {
        mc[key] = MASK_VALUE;
      }
    }
    masked.config = mc;
  }
  return masked;
}

/**
 * Check if a value is the mask placeholder.
 */
function isMasked(value) {
  return value === MASK_VALUE;
}

module.exports = { maskCredentials, isMasked, MASK_VALUE, SENSITIVE_KEYS };
