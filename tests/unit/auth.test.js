/**
 * Auth Middleware Unit Tests
 *
 * Tests for: authenticate, requireRole, requireSuperAdmin,
 * requirePlatformAdmin, tenantFilter, validateSuperAdminEmail
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
  setupAuth, authenticate, requireRole, requireSuperAdmin,
  requirePlatformAdmin, tenantFilter, validateSuperAdminEmail,
  JWT_SECRET, SUPER_ADMIN_DOMAIN
} = require('../../src/shared/middleware/auth');

// Enable local JWT auth (config.xsuaa is null)
setupAuth({});

// --- Helpers ---
const mockReq = (overrides = {}) => ({
  headers: {},
  user: null,
  ...overrides
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = () => jest.fn();

function createToken(payload, options = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h', ...options });
}

// --- Tests ---

describe('Auth Middleware', () => {
  describe('JWT_SECRET & SUPER_ADMIN_DOMAIN exports', () => {
    it('should export the default JWT_SECRET', () => {
      expect(JWT_SECRET).toBe('redigo-logistics-secret-key-change-in-production');
    });

    it('should export the default SUPER_ADMIN_DOMAIN', () => {
      expect(SUPER_ADMIN_DOMAIN).toBe('@redigo.com');
    });
  });

  describe('authenticate', () => {
    it('should return 401 when no authorization header is present', () => {
      const req = mockReq();
      const res = mockRes();
      const next = mockNext();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Token gerekli' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header does not start with Bearer', () => {
      const req = mockReq({ headers: { authorization: 'Basic abc123' } });
      const res = mockRes();
      const next = mockNext();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Token gerekli' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 with "Gecersiz token" for an invalid token', () => {
      const req = mockReq({ headers: { authorization: 'Bearer invalid.token.here' } });
      const res = mockRes();
      const next = mockNext();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Gecersiz token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 with "Token suresi dolmus" for an expired token', () => {
      const expiredToken = jwt.sign(
        { user_id: 1, tenant_id: 'T1', role: 'TENANT_USER' },
        JWT_SECRET,
        { expiresIn: '-1s' }
      );
      const req = mockReq({ headers: { authorization: `Bearer ${expiredToken}` } });
      const res = mockRes();
      const next = mockNext();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Token suresi dolmus' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should set req.user, req.tenantId, req.userRole and call next() for a valid token', () => {
      const payload = { user_id: 42, tenant_id: 'TENANT_A', role: 'TENANT_ADMIN' };
      const token = createToken(payload);
      const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
      const res = mockRes();
      const next = mockNext();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.user_id).toBe(42);
      expect(req.tenantId).toBe('TENANT_A');
      expect(req.userRole).toBe('TENANT_ADMIN');
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 401 for a token signed with wrong secret', () => {
      const token = jwt.sign({ user_id: 1 }, 'wrong-secret', { expiresIn: '1h' });
      const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
      const res = mockRes();
      const next = mockNext();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Gecersiz token' });
    });
  });

  describe('requireRole', () => {
    it('should return 401 when req.user is not set', () => {
      const middleware = requireRole('TENANT_USER');
      const req = mockReq();
      const res = mockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when user role is below required role', () => {
      const middleware = requireRole('TENANT_ADMIN');
      const req = mockReq({ user: { role: 'TENANT_USER' } });
      const res = mockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Yetersiz yetki: TENANT_ADMIN veya ustu gerekli'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() when user role matches required role exactly', () => {
      const middleware = requireRole('TENANT_ADMIN');
      const req = mockReq({ user: { role: 'TENANT_ADMIN' } });
      const res = mockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should call next() when user role is higher than required', () => {
      const middleware = requireRole('TENANT_USER');
      const req = mockReq({ user: { role: 'SUPER_ADMIN' } });
      const res = mockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should call next() when is_super_admin is true regardless of role', () => {
      const middleware = requireRole('SUPER_ADMIN');
      const req = mockReq({ user: { role: 'TENANT_USER', is_super_admin: true } });
      const res = mockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should respect full hierarchy: TENANT_USER < TENANT_ADMIN < SUPER_ADMIN', () => {
      const next = mockNext();

      // TENANT_USER cannot access SUPER_ADMIN
      const res1 = mockRes();
      requireRole('SUPER_ADMIN')(mockReq({ user: { role: 'TENANT_USER' } }), res1, jest.fn());
      expect(res1.status).toHaveBeenCalledWith(403);

      // TENANT_ADMIN cannot access SUPER_ADMIN
      const res2 = mockRes();
      requireRole('SUPER_ADMIN')(mockReq({ user: { role: 'TENANT_ADMIN' } }), res2, jest.fn());
      expect(res2.status).toHaveBeenCalledWith(403);

      // SUPER_ADMIN can access TENANT_USER
      const next3 = mockNext();
      requireRole('TENANT_USER')(mockReq({ user: { role: 'SUPER_ADMIN' } }), mockRes(), next3);
      expect(next3).toHaveBeenCalled();

      // TENANT_ADMIN can access TENANT_USER
      const next4 = mockNext();
      requireRole('TENANT_USER')(mockReq({ user: { role: 'TENANT_ADMIN' } }), mockRes(), next4);
      expect(next4).toHaveBeenCalled();
    });

    it('should treat unknown roles as level 0', () => {
      const middleware = requireRole('TENANT_USER');
      const req = mockReq({ user: { role: 'UNKNOWN_ROLE' } });
      const res = mockRes();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('requireSuperAdmin', () => {
    it('should return 401 when req.user is not set', () => {
      const req = mockReq();
      const res = mockRes();
      const next = mockNext();

      requireSuperAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('should return 403 when is_super_admin is false', () => {
      const req = mockReq({ user: { is_super_admin: false } });
      const res = mockRes();
      const next = mockNext();

      requireSuperAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Super Admin yetkisi gerekli' });
    });

    it('should return 403 when is_super_admin is undefined', () => {
      const req = mockReq({ user: { role: 'TENANT_ADMIN' } });
      const res = mockRes();
      const next = mockNext();

      requireSuperAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should call next() when is_super_admin is true', () => {
      const req = mockReq({ user: { is_super_admin: true } });
      const res = mockRes();
      const next = mockNext();

      requireSuperAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('requirePlatformAdmin', () => {
    it('should return 401 when req.user is not set', () => {
      const req = mockReq();
      const res = mockRes();
      const next = mockNext();

      requirePlatformAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('should return 403 when only is_super_admin is true but not is_system_tenant', () => {
      const req = mockReq({ user: { is_super_admin: true, is_system_tenant: false } });
      const res = mockRes();
      const next = mockNext();

      requirePlatformAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Platform Admin yetkisi gerekli (sistem tenant + super admin)'
      });
    });

    it('should return 403 when only is_system_tenant is true but not is_super_admin', () => {
      const req = mockReq({ user: { is_super_admin: false, is_system_tenant: true } });
      const res = mockRes();
      const next = mockNext();

      requirePlatformAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 when neither flag is set', () => {
      const req = mockReq({ user: { role: 'TENANT_ADMIN' } });
      const res = mockRes();
      const next = mockNext();

      requirePlatformAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should call next() when both is_super_admin and is_system_tenant are true', () => {
      const req = mockReq({ user: { is_super_admin: true, is_system_tenant: true } });
      const res = mockRes();
      const next = mockNext();

      requirePlatformAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('tenantFilter', () => {
    it('should return empty object when req.user is not set', () => {
      const req = mockReq();
      const result = tenantFilter(req);
      expect(result).toEqual({});
    });

    it('should return empty object for super admin without impersonation', () => {
      const req = mockReq({ user: { is_super_admin: true } });
      const result = tenantFilter(req);
      expect(result).toEqual({});
    });

    it('should return tenant_id filter for super admin impersonating a tenant', () => {
      const req = mockReq({
        user: { is_super_admin: true, impersonating: true, tenant_id: 'TENANT_X' }
      });
      const result = tenantFilter(req);
      expect(result).toEqual({ tenant_id: 'TENANT_X' });
    });

    it('should return tenant_id filter for normal user from user.tenant_id', () => {
      const req = mockReq({
        user: { is_super_admin: false, tenant_id: 'TENANT_B' }
      });
      const result = tenantFilter(req);
      expect(result).toEqual({ tenant_id: 'TENANT_B' });
    });

    it('should fall back to req.tenantId when user.tenant_id is not set', () => {
      const req = mockReq({
        user: { is_super_admin: false },
        tenantId: 'TENANT_C'
      });
      const result = tenantFilter(req);
      expect(result).toEqual({ tenant_id: 'TENANT_C' });
    });
  });

  describe('validateSuperAdminEmail', () => {
    it('should return true for email ending with @redigo.com', () => {
      expect(validateSuperAdminEmail('admin@redigo.com')).toBe(true);
    });

    it('should return true for email with uppercase domain', () => {
      expect(validateSuperAdminEmail('admin@REDIGO.COM')).toBe(true);
    });

    it('should return false for email with wrong domain', () => {
      expect(validateSuperAdminEmail('user@other.com')).toBe(false);
    });

    it('should return false when email is null', () => {
      expect(validateSuperAdminEmail(null)).toBe(false);
    });

    it('should return false when email is undefined', () => {
      expect(validateSuperAdminEmail(undefined)).toBe(false);
    });

    it('should return false when email is empty string', () => {
      expect(validateSuperAdminEmail('')).toBe(false);
    });

    it('should return false for partial domain match at wrong position', () => {
      expect(validateSuperAdminEmail('user@notredigo.com')).toBe(false);
    });
  });
});
