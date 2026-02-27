const logger = require('./logger');
const DbStore = require('../database/dbStore');

const securityStore = new DbStore('security_profiles');

// OAUTH2 token cache: { profileId: { token, expiresAt } }
const tokenCache = {};

/**
 * Security profile'dan auth header'larını çöz
 */
async function resolveSecurityHeaders(securityProfileId) {
  if (!securityProfileId) return {};

  const profiles = await securityStore.readAll();
  const profile = profiles.find(p => p.id === securityProfileId && p.is_active);
  if (!profile) {
    logger.warn('Security profile not found or inactive', { id: securityProfileId });
    return {};
  }

  const cfg = profile.config || {};

  switch (profile.auth_type) {
    case 'OAUTH2': {
      // Token cache kontrolü
      const cached = tokenCache[securityProfileId];
      if (cached && cached.expiresAt > Date.now()) {
        return { 'Authorization': 'Bearer ' + cached.token };
      }
      // Yeni token al
      try {
        const params = new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: cfg.client_id,
          client_secret: cfg.client_secret
        });
        if (cfg.scope) params.append('scope', cfg.scope);

        const tokenRes = await fetch(cfg.token_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        });
        const tokenBody = await tokenRes.json();
        if (tokenBody.access_token) {
          tokenCache[securityProfileId] = {
            token: tokenBody.access_token,
            expiresAt: Date.now() + ((tokenBody.expires_in || 3600) - 60) * 1000
          };
          return { 'Authorization': 'Bearer ' + tokenBody.access_token };
        }
        logger.error('OAUTH2 token failed', { response: tokenBody });
        return {};
      } catch (err) {
        logger.error('OAUTH2 token fetch error', { error: err.message });
        return {};
      }
    }

    case 'API_KEY': {
      const headerName = cfg.header_name || 'X-API-Key';
      return { [headerName]: cfg.api_key };
    }

    case 'BASIC': {
      const encoded = Buffer.from(cfg.username + ':' + cfg.password).toString('base64');
      return { 'Authorization': 'Basic ' + encoded };
    }

    case 'BEARER': {
      return { 'Authorization': 'Bearer ' + cfg.token };
    }

    case 'PROCESS_KEY': {
      // Horoz API'lerinde processKey iki modda kullanılır:
      //   injection: "header" → Header'a eklenir (Yurtiçi Dağıtım, Kargo Takip)
      //   injection: "body"   → Body'ye enjekte edilir (Depolama, E-Ticaret)
      const keyField = cfg.key_field || 'processKey';
      if (cfg.injection === 'header') {
        return { [keyField]: cfg.key_value };
      }
      // Default: body injection
      return { _bodyParams: { [keyField]: cfg.key_value } };
    }

    default:
      return {};
  }
}

/**
 * BTP Destination Service üzerinden HTTP istek gönder.
 * URL formatı: dest://DESTINATION_NAME/path
 */
async function dispatchViaDestination(destinationName, path, opts) {
  const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
  const startTime = Date.now();

  try {
    logger.info('Dispatch via BTP Destination', { destination: destinationName, path, method: opts.method });
    const response = await executeHttpRequest(
      { destinationName },
      {
        method: opts.method || 'POST',
        url: path,
        data: opts.body || undefined,
        headers: opts.headers || {},
      }
    );
    const duration_ms = Date.now() - startTime;
    return {
      ok: response.status >= 200 && response.status < 300,
      statusCode: response.status,
      statusText: response.statusText,
      responseBody: response.data,
      duration_ms,
      error: response.status >= 400 ? 'HTTP ' + response.status + ' ' + response.statusText : null,
    };
  } catch (err) {
    const duration_ms = Date.now() - startTime;
    logger.error('Destination dispatch error', { destination: destinationName, error: err.message });
    return {
      ok: false,
      statusCode: err.response ? err.response.status : 0,
      statusText: 'Destination Error',
      responseBody: err.response ? err.response.data : null,
      duration_ms,
      error: err.message,
    };
  }
}

/**
 * 3PL API'ye HTTP istek gönder.
 *
 * URL dest:// ile başlıyorsa → BTP Destination Service kullan.
 * Aksi halde → direkt fetch (mevcut davranış).
 *
 * @param {Object} opts
 * @param {string} opts.url - Hedef API URL veya dest://DEST_NAME/path
 * @param {string} opts.method - HTTP method (GET, POST, PUT, etc.)
 * @param {Array}  opts.headers - [{key, value}] formatında custom header'lar
 * @param {string} opts.securityProfileId - Security profil ID'si
 * @param {Object} opts.body - Gönderilecek JSON body
 * @returns {Object} { ok, statusCode, statusText, responseBody, duration_ms, error }
 */
async function dispatch(opts) {
  const { url, method = 'POST', headers = [], securityProfileId, body } = opts;

  // ── BTP Destination Service: dest://DEST_NAME/path ──
  if (url && url.startsWith('dest://')) {
    const withoutPrefix = url.substring(7); // "DEST_NAME/path"
    const slashIdx = withoutPrefix.indexOf('/');
    const destinationName = slashIdx > 0 ? withoutPrefix.substring(0, slashIdx) : withoutPrefix;
    const path = slashIdx > 0 ? withoutPrefix.substring(slashIdx) : '/';

    const reqHeaders = {};
    headers.forEach(h => { if (h.key && h.value) reqHeaders[h.key] = h.value; });

    return dispatchViaDestination(destinationName, path, { method, headers: reqHeaders, body });
  }

  // ── Direkt HTTP fetch (mevcut davranış) ──
  const startTime = Date.now();

  try {
    // Header'ları birleştir
    const reqHeaders = { 'Content-Type': 'application/json' };
    headers.forEach(h => { if (h.key && h.value) reqHeaders[h.key] = h.value; });

    // Security header'ları ekle
    const authResult = await resolveSecurityHeaders(securityProfileId);
    // PROCESS_KEY gibi body-injection auth tipleri _bodyParams döner
    const bodyParams = authResult._bodyParams;
    if (bodyParams) delete authResult._bodyParams;
    Object.assign(reqHeaders, authResult);

    // Body hazırla (PROCESS_KEY varsa body'ye enjekte et)
    let finalBody = body;
    if (bodyParams && finalBody && typeof finalBody === 'object') {
      finalBody = { ...bodyParams, ...finalBody };
    } else if (bodyParams && !finalBody) {
      finalBody = { ...bodyParams };
    }

    const fetchOpts = { method, headers: reqHeaders };
    if (method !== 'GET' && finalBody) {
      fetchOpts.body = JSON.stringify(finalBody);
    }

    logger.info('Dispatch to 3PL', { url, method });

    const response = await fetch(url, fetchOpts);
    const responseText = await response.text();
    const duration_ms = Date.now() - startTime;

    let responseBody;
    try { responseBody = JSON.parse(responseText); } catch (_) { responseBody = responseText; }

    return {
      ok: response.ok,
      statusCode: response.status,
      statusText: response.statusText,
      responseBody,
      duration_ms,
      error: response.ok ? null : 'HTTP ' + response.status + ' ' + response.statusText
    };
  } catch (err) {
    const duration_ms = Date.now() - startTime;
    logger.error('Dispatch error', { url, error: err.message });
    return {
      ok: false,
      statusCode: 0,
      statusText: 'Network Error',
      responseBody: null,
      duration_ms,
      error: err.message
    };
  }
}

module.exports = { dispatch, resolveSecurityHeaders };
