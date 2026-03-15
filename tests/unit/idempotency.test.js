/**
 * Idempotency Middleware Unit Tests
 */
jest.mock('../../src/shared/database/pool', () => ({
  query: jest.fn()
}));
jest.mock('../../src/shared/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const { query } = require('../../src/shared/database/pool');
const { idempotency } = require('../../src/shared/middleware/idempotency');

function mockReqRes(overrides = {}) {
  const req = {
    headers: {},
    tenantId: 'tenant-1',
    user: { tenant_id: 'tenant-1' },
    method: 'POST',
    originalUrl: '/api/v1/test',
    ...overrides
  };
  const res = {
    statusCode: 200,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    set: jest.fn()
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('idempotency middleware', () => {
  const middleware = idempotency();

  beforeEach(() => {
    query.mockReset();
  });

  it('should pass through when no X-Idempotency-Key header', async () => {
    const { req, res, next } = mockReqRes();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('should return cached response on cache hit', async () => {
    const cachedBody = { data: { id: '123' } };
    query.mockResolvedValue({
      rows: [{ response_status: 201, response_body: cachedBody, created_at: '2026-01-01' }]
    });

    const { req, res, next } = mockReqRes({
      headers: { 'x-idempotency-key': 'key-123' }
    });

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('X-Idempotency-Replayed', 'true');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(cachedBody);
  });

  it('should call next and intercept response on cache miss', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // cache miss
    query.mockResolvedValueOnce({}); // save response

    const { req, res, next } = mockReqRes({
      headers: { 'x-idempotency-key': 'new-key' }
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    // res.json should be wrapped
    expect(typeof res.json).toBe('function');
  });

  it('should handle database errors gracefully', async () => {
    query.mockRejectedValue(new Error('DB connection failed'));

    const { req, res, next } = mockReqRes({
      headers: { 'x-idempotency-key': 'error-key' }
    });

    await middleware(req, res, next);

    // Should still call next despite error
    expect(next).toHaveBeenCalled();
  });

  it('should scope cache key by tenant', async () => {
    query.mockResolvedValue({ rows: [] });

    const { req, res, next } = mockReqRes({
      headers: { 'x-idempotency-key': 'scoped-key' },
      tenantId: 'tenant-abc'
    });

    await middleware(req, res, next);

    const selectCall = query.mock.calls[0];
    expect(selectCall[1]).toEqual(['tenant-abc:scoped-key']);
  });
});
