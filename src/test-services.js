#!/usr/bin/env node
/**
 * Mock Test Servisleri — Guvenlik profili testleri icin lokal mock API'ler
 *
 * Port: 3001
 *
 * Endpoints:
 *   POST /mock/oauth2/token     → client_credentials ile access_token doner
 *   POST /mock/secure-basic     → Basic auth dogrular
 *   POST /mock/secure-apikey    → X-Api-Key header dogrular
 *   POST /mock/secure-oauth2    → Bearer token dogrular
 *   POST /mock/open-api         → Auth'suz, her zaman 200
 *
 * Kullanim: npm run test-services
 */

const http = require('http');
const crypto = require('crypto');

const PORT = 3001;

// ── Mock Credentials ──
const OAUTH2_CLIENT_ID = 'test_client';
const OAUTH2_CLIENT_SECRET = 'test_secret';
const BASIC_USER = 'test';
const BASIC_PASS = 'test123';
const API_KEY = 'MOCK_KEY_2026';

// Basit JWT benzeri token (gercek JWT degil, test icin yeterli)
let tokenCounter = 0;
function generateMockToken() {
  tokenCounter++;
  const payload = {
    iss: 'mock-auth-server',
    sub: OAUTH2_CLIENT_ID,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: 'api',
    jti: crypto.randomBytes(8).toString('hex')
  };
  // Base64 encoded mock JWT (header.payload.signature)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', 'mock-secret').update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + sig;
}

// Aktif tokenlar (token → expiry)
const activeTokens = new Map();

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        // form-urlencoded veya JSON
        if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(data);
          resolve(Object.fromEntries(params));
        } else {
          resolve(data ? JSON.parse(data) : {});
        }
      } catch (e) {
        resolve({ _raw: data });
      }
    });
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data, null, 2));
}

function timestamp() {
  return new Date().toISOString();
}

function log(method, path, status, detail) {
  const color = status < 400 ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${status}\x1b[0m ${method} ${path} ${detail || ''}`);
}

// ── Route Handlers ──

async function handleOAuth2Token(req, res) {
  const body = await parseBody(req);
  const { grant_type, client_id, client_secret, scope } = body;

  if (grant_type !== 'client_credentials') {
    log('POST', '/mock/oauth2/token', 400, '→ unsupported grant_type: ' + grant_type);
    return json(res, 400, { error: 'unsupported_grant_type', error_description: 'Yalnizca client_credentials desteklenir' });
  }

  if (client_id !== OAUTH2_CLIENT_ID || client_secret !== OAUTH2_CLIENT_SECRET) {
    log('POST', '/mock/oauth2/token', 401, '→ invalid credentials');
    return json(res, 401, { error: 'invalid_client', error_description: 'Gecersiz client_id veya client_secret' });
  }

  const token = generateMockToken();
  activeTokens.set(token, Date.now() + 3600000);

  log('POST', '/mock/oauth2/token', 200, '→ token #' + tokenCounter);
  return json(res, 200, {
    access_token: token,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: scope || 'api'
  });
}

async function handleSecureBasic(req, res) {
  const body = await parseBody(req);
  const auth = req.headers['authorization'];

  if (!auth || !auth.startsWith('Basic ')) {
    log('POST', '/mock/secure-basic', 401, '→ Authorization header eksik');
    return json(res, 401, {
      error: 'unauthorized',
      message: 'Basic Authorization header gerekli',
      timestamp: timestamp()
    });
  }

  const decoded = Buffer.from(auth.substring(6), 'base64').toString();
  const [user, pass] = decoded.split(':');

  if (user !== BASIC_USER || pass !== BASIC_PASS) {
    log('POST', '/mock/secure-basic', 403, '→ wrong credentials: ' + user);
    return json(res, 403, {
      error: 'forbidden',
      message: 'Gecersiz kullanici adi veya sifre',
      received_user: user,
      timestamp: timestamp()
    });
  }

  log('POST', '/mock/secure-basic', 200, '→ user: ' + user);
  return json(res, 200, {
    success: true,
    auth_type: 'BASIC',
    user: user,
    message: 'Basic auth dogrulandi',
    received_body: body,
    received_headers: filterHeaders(req.headers),
    timestamp: timestamp()
  });
}

async function handleSecureApiKey(req, res) {
  const body = await parseBody(req);
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    log('POST', '/mock/secure-apikey', 401, '→ X-Api-Key header eksik');
    return json(res, 401, {
      error: 'unauthorized',
      message: 'X-Api-Key header gerekli',
      timestamp: timestamp()
    });
  }

  if (apiKey !== API_KEY) {
    log('POST', '/mock/secure-apikey', 403, '→ wrong key: ' + apiKey.substring(0, 8) + '...');
    return json(res, 403, {
      error: 'forbidden',
      message: 'Gecersiz API anahtari',
      timestamp: timestamp()
    });
  }

  log('POST', '/mock/secure-apikey', 200, '→ valid key');
  return json(res, 200, {
    success: true,
    auth_type: 'API_KEY',
    message: 'API key dogrulandi',
    received_body: body,
    received_headers: filterHeaders(req.headers),
    timestamp: timestamp()
  });
}

async function handleSecureOAuth2(req, res) {
  const body = await parseBody(req);
  const auth = req.headers['authorization'];

  if (!auth || !auth.startsWith('Bearer ')) {
    log('POST', '/mock/secure-oauth2', 401, '→ Bearer token eksik');
    return json(res, 401, {
      error: 'unauthorized',
      message: 'Bearer token gerekli',
      timestamp: timestamp()
    });
  }

  const token = auth.substring(7);

  // Token gecerli mi kontrol et
  const expiry = activeTokens.get(token);
  if (!expiry || expiry < Date.now()) {
    log('POST', '/mock/secure-oauth2', 401, '→ invalid/expired token');
    return json(res, 401, {
      error: 'invalid_token',
      message: 'Token gecersiz veya suresi dolmus',
      timestamp: timestamp()
    });
  }

  log('POST', '/mock/secure-oauth2', 200, '→ valid token');
  return json(res, 200, {
    success: true,
    auth_type: 'OAUTH2',
    message: 'Bearer token dogrulandi',
    token_preview: token.substring(0, 30) + '...',
    received_body: body,
    received_headers: filterHeaders(req.headers),
    timestamp: timestamp()
  });
}

async function handleOpenApi(req, res) {
  const body = await parseBody(req);
  log(req.method, '/mock/open-api', 200, '→ no auth required');
  return json(res, 200, {
    success: true,
    auth_type: 'NONE',
    message: 'Auth gerektirmeyen endpoint',
    received_body: body,
    received_headers: filterHeaders(req.headers),
    timestamp: timestamp()
  });
}

function filterHeaders(headers) {
  const skip = ['host', 'connection', 'content-length', 'accept-encoding'];
  const result = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!skip.includes(k)) result[k] = v;
  }
  return result;
}

// ── CORS preflight ──
function handleCors(req, res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key, Accept',
    'Access-Control-Max-Age': '86400'
  });
  res.end();
}

// ── Server ──
const server = http.createServer(async (req, res) => {
  // CORS
  if (req.method === 'OPTIONS') return handleCors(req, res);

  const url = req.url.split('?')[0];

  try {
    switch (url) {
      case '/mock/oauth2/token':
        return await handleOAuth2Token(req, res);
      case '/mock/secure-basic':
        return await handleSecureBasic(req, res);
      case '/mock/secure-apikey':
        return await handleSecureApiKey(req, res);
      case '/mock/secure-oauth2':
        return await handleSecureOAuth2(req, res);
      case '/mock/open-api':
        return await handleOpenApi(req, res);
      case '/health':
        return json(res, 200, { status: 'ok', service: 'mock-test-services', port: PORT });
      default:
        log(req.method, url, 404, '');
        return json(res, 404, { error: 'not_found', message: 'Endpoint bulunamadi: ' + url });
    }
  } catch (err) {
    log(req.method, url, 500, '→ ' + err.message);
    return json(res, 500, { error: 'internal_error', message: err.message });
  }
});

server.listen(PORT, () => {
  console.log('\n\x1b[36m╔══════════════════════════════════════════════════╗');
  console.log('║       Mock Test Servisleri Baslatildi             ║');
  console.log('╚══════════════════════════════════════════════════╝\x1b[0m\n');
  console.log('  Port: \x1b[33m' + PORT + '\x1b[0m\n');
  console.log('  Endpoints:');
  console.log('    POST /mock/oauth2/token      OAuth2 token endpoint');
  console.log('    POST /mock/secure-oauth2      Bearer token dogrulama');
  console.log('    POST /mock/secure-basic       Basic auth dogrulama');
  console.log('    POST /mock/secure-apikey      API key dogrulama');
  console.log('    POST /mock/open-api           Auth\'suz endpoint');
  console.log('    GET  /health                  Saglik kontrolu\n');
  console.log('  Test Credentials:');
  console.log('    OAUTH2:  client_id=\x1b[32mtest_client\x1b[0m  client_secret=\x1b[32mtest_secret\x1b[0m');
  console.log('    BASIC:   username=\x1b[32mtest\x1b[0m  password=\x1b[32mtest123\x1b[0m');
  console.log('    API_KEY: \x1b[32mMOCK_KEY_2026\x1b[0m (header: X-Api-Key)\n');
  console.log('  \x1b[90mCtrl+C ile durdur\x1b[0m\n');
});
