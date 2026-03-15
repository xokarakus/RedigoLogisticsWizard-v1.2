/**
 * Middleware Unit Tests — auth, validation, tenantFilter
 */
const jwt = require('jsonwebtoken');

// Mock dependencies before requiring auth module
jest.mock('../../src/shared/config', () => ({ xsuaa: null }));
jest.mock('../../src/shared/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));
jest.mock('passport', () => ({
  use: jest.fn(),
  initialize: jest.fn(() => (req, res, next) => next()),
  authenticate: jest.fn()
}));

const {
  setupAuth, authenticate, requireRole, requireSuperAdmin, requirePlatformAdmin,
  tenantFilter, validateSuperAdminEmail, JWT_SECRET
} = require('../../src/shared/middleware/auth');

// Enable auth (local JWT mode since config.xsuaa is null)
setupAuth({});

const { validate } = require('../../src/shared/validators/middleware');
const { z } = require('zod');

// Helper to create mock req/res/next
function mockReqRes(overrides = {}) {
  const req = {
    headers: {},
    user: null,
    body: {},
    query: {},
    params: {},
    ...overrides
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('authenticate middleware', () => {
  it('should reject request without Authorization header', () => {
    const { req, res, next } = mockReqRes();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token gerekli' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject non-Bearer token', () => {
    const { req, res, next } = mockReqRes({
      headers: { authorization: 'Basic abc123' }
    });

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should accept valid JWT and set req.user', () => {
    const payload = { user_id: '1', tenant_id: 'tenant-1', role: 'TENANT_ADMIN' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    const { req, res, next } = mockReqRes({
      headers: { authorization: 'Bearer ' + token }
    });

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.user_id).toBe('1');
    expect(req.tenantId).toBe('tenant-1');
    expect(req.userRole).toBe('TENANT_ADMIN');
  });

  it('should reject expired JWT', () => {
    const token = jwt.sign({ user_id: '1' }, JWT_SECRET, { expiresIn: '-1s' });
    const { req, res, next } = mockReqRes({
      headers: { authorization: 'Bearer ' + token }
    });

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token suresi dolmus' });
  });

  it('should reject tampered JWT', () => {
    const { req, res, next } = mockReqRes({
      headers: { authorization: 'Bearer invalidtoken.xyz.abc' }
    });

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Gecersiz token' });
  });
});

describe('requireRole middleware', () => {
  it('should allow user with matching role', () => {
    const middleware = requireRole('TENANT_ADMIN');
    const { req, res, next } = mockReqRes();
    req.user = { role: 'TENANT_ADMIN' };

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should allow user with higher role', () => {
    const middleware = requireRole('TENANT_USER');
    const { req, res, next } = mockReqRes();
    req.user = { role: 'TENANT_ADMIN' };

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should reject user with lower role', () => {
    const middleware = requireRole('TENANT_ADMIN');
    const { req, res, next } = mockReqRes();
    req.user = { role: 'TENANT_USER' };

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should allow super admin for any role', () => {
    const middleware = requireRole('TENANT_ADMIN');
    const { req, res, next } = mockReqRes();
    req.user = { role: 'TENANT_USER', is_super_admin: true };

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should reject when no user', () => {
    const middleware = requireRole('TENANT_USER');
    const { req, res, next } = mockReqRes();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('requireSuperAdmin middleware', () => {
  it('should allow super admin', () => {
    const { req, res, next } = mockReqRes();
    req.user = { is_super_admin: true };

    requireSuperAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should reject non-super admin', () => {
    const { req, res, next } = mockReqRes();
    req.user = { role: 'TENANT_ADMIN' };

    requireSuperAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should reject when no user', () => {
    const { req, res, next } = mockReqRes();

    requireSuperAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('requirePlatformAdmin middleware', () => {
  it('should allow super admin from system tenant', () => {
    const { req, res, next } = mockReqRes();
    req.user = { is_super_admin: true, is_system_tenant: true };

    requirePlatformAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should reject super admin from non-system tenant', () => {
    const { req, res, next } = mockReqRes();
    req.user = { is_super_admin: true, is_system_tenant: false };

    requirePlatformAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('tenantFilter', () => {
  it('should return empty filter for super admin', () => {
    const req = { user: { is_super_admin: true } };
    expect(tenantFilter(req)).toEqual({});
  });

  it('should return tenant_id filter for regular user', () => {
    const req = { user: { tenant_id: 'abc' } };
    expect(tenantFilter(req)).toEqual({ tenant_id: 'abc' });
  });

  it('should filter by impersonated tenant for super admin', () => {
    const req = { user: { is_super_admin: true, impersonating: true, tenant_id: 'target' } };
    expect(tenantFilter(req)).toEqual({ tenant_id: 'target' });
  });

  it('should return empty for no user', () => {
    expect(tenantFilter({})).toEqual({});
  });
});

describe('validateSuperAdminEmail', () => {
  it('should accept email with correct domain', () => {
    expect(validateSuperAdminEmail('admin@redigo.com')).toBe(true);
  });

  it('should reject email with wrong domain', () => {
    expect(validateSuperAdminEmail('admin@other.com')).toBe(false);
  });

  it('should reject null email', () => {
    expect(validateSuperAdminEmail(null)).toBe(false);
  });

  it('should be case-insensitive', () => {
    expect(validateSuperAdminEmail('Admin@REDIGO.COM')).toBe(true);
  });
});

describe('validate middleware', () => {
  const TestSchema = z.object({
    name: z.string().min(1),
    age: z.number().int().min(0)
  });

  it('should pass valid data and set req.body', () => {
    const { req, res, next } = mockReqRes({ body: { name: 'Test', age: 25 } });
    const middleware = validate(TestSchema);

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ name: 'Test', age: 25 });
  });

  it('should return 400 for invalid data', () => {
    const { req, res, next } = mockReqRes({ body: { name: '', age: -1 } });
    const middleware = validate(TestSchema);

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Dogrulama hatasi',
      details: expect.any(Array)
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should validate query params when source is query', () => {
    const QuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100) });
    const { req, res, next } = mockReqRes({ query: { limit: '50' } });
    const middleware = validate(QuerySchema, 'query');

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.query.limit).toBe(50);
  });

  it('should include field info in error details', () => {
    const { req, res, next } = mockReqRes({ body: { name: 123, age: 'not-number' } });
    const middleware = validate(TestSchema);

    middleware(req, res, next);

    const details = res.json.mock.calls[0][0].details;
    expect(details.length).toBeGreaterThan(0);
    expect(details[0]).toHaveProperty('field');
    expect(details[0]).toHaveProperty('message');
    expect(details[0]).toHaveProperty('code');
  });
});
