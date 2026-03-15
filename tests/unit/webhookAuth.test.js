/**
 * Webhook Authentication Middleware Tests
 */
const crypto = require('crypto');

// Mock database and logger
jest.mock('../../src/shared/database/pool', () => ({
  query: jest.fn()
}));
jest.mock('../../src/shared/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const { query } = require('../../src/shared/database/pool');
const { webhookAuth } = require('../../src/shared/middleware/webhookAuth');

function mockReqRes(overrides = {}) {
  const req = {
    headers: {},
    body: {},
    ip: '127.0.0.1',
    originalUrl: '/api/v1/webhook',
    ...overrides
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('webhookAuth middleware', () => {
  const middleware = webhookAuth({ settingsKey: 'webhook_wms' });

  beforeEach(() => {
    query.mockReset();
    delete process.env.WEBHOOK_API_KEY;
    delete process.env.WEBHOOK_SECRET;
  });

  it('should reject request without X-API-Key', async () => {
    const { req, res, next } = mockReqRes();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'X-API-Key header gerekli' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject invalid API key', async () => {
    query.mockResolvedValue({ rows: [] });
    const { req, res, next } = mockReqRes({
      headers: { 'x-api-key': 'invalid-key' }
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should accept valid API key from database', async () => {
    query.mockResolvedValue({
      rows: [{ tenant_id: 'tenant-1', value: JSON.stringify({ api_key: 'valid-key' }) }]
    });
    const { req, res, next } = mockReqRes({
      headers: { 'x-api-key': 'valid-key' }
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.webhookTenantId).toBe('tenant-1');
  });

  it('should accept global fallback API key from env', async () => {
    process.env.WEBHOOK_API_KEY = 'env-key';
    query.mockResolvedValue({ rows: [] });
    const { req, res, next } = mockReqRes({
      headers: { 'x-api-key': 'env-key' }
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.webhookTenantId).toBeUndefined(); // global key = no tenant
  });

  it('should reject expired timestamp (replay attack)', async () => {
    query.mockResolvedValue({
      rows: [{ tenant_id: 'tenant-1', value: JSON.stringify({ api_key: 'key1' }) }]
    });
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const { req, res, next } = mockReqRes({
      headers: {
        'x-api-key': 'key1',
        'x-timestamp': String(oldTimestamp)
      }
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('zaman') })
    );
  });

  it('should accept valid timestamp within window', async () => {
    query.mockResolvedValue({
      rows: [{ tenant_id: 'tenant-1', value: JSON.stringify({ api_key: 'key1' }) }]
    });
    const validTimestamp = Math.floor(Date.now() / 1000);
    const { req, res, next } = mockReqRes({
      headers: {
        'x-api-key': 'key1',
        'x-timestamp': String(validTimestamp)
      }
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should verify valid HMAC signature', async () => {
    const secret = 'my-webhook-secret';
    const body = { delivery_no: '12345' };
    const signature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('hex');

    query.mockResolvedValue({
      rows: [{ tenant_id: 'tenant-1', value: JSON.stringify({ api_key: 'key1', secret }) }]
    });
    const { req, res, next } = mockReqRes({
      headers: {
        'x-api-key': 'key1',
        'x-signature': signature
      },
      body
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should reject invalid HMAC signature', async () => {
    const secret = 'my-webhook-secret';
    query.mockResolvedValue({
      rows: [{ tenant_id: 'tenant-1', value: JSON.stringify({ api_key: 'key1', secret }) }]
    });
    const { req, res, next } = mockReqRes({
      headers: {
        'x-api-key': 'key1',
        'x-signature': 'deadbeef'.repeat(8)
      },
      body: { delivery_no: '12345' }
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Gecersiz imza' });
  });

  it('should require signature when requireSignature=true', async () => {
    const strictMiddleware = webhookAuth({ settingsKey: 'webhook_wms', requireSignature: true });
    query.mockResolvedValue({
      rows: [{ tenant_id: 'tenant-1', value: JSON.stringify({ api_key: 'key1' }) }]
    });
    const { req, res, next } = mockReqRes({
      headers: { 'x-api-key': 'key1' }
    });

    await strictMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'X-Signature header gerekli' });
  });

  it('should handle database errors gracefully', async () => {
    query.mockRejectedValue(new Error('Connection refused'));
    const { req, res, next } = mockReqRes({
      headers: { 'x-api-key': 'any-key' }
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('should handle malformed JSON in settings value', async () => {
    query.mockResolvedValue({
      rows: [{ tenant_id: 'tenant-1', value: '{invalid json' }]
    });
    process.env.WEBHOOK_API_KEY = 'env-key';
    const { req, res, next } = mockReqRes({
      headers: { 'x-api-key': 'env-key' }
    });

    await middleware(req, res, next);

    // Should fall through to env key fallback
    expect(next).toHaveBeenCalled();
  });
});
