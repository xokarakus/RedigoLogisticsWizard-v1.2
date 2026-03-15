/**
 * Zod Schema Validation Tests
 */
const {
  SetupSchema, LoginSchema, ChangePasswordSchema, CreateTenantSchema,
  CreateUserSchema, ImpersonateSchema, RefreshTokenSchema,
  ForgotPasswordSchema, ResetPasswordSchema
} = require('../../src/shared/validators/auth.schemas');

const {
  WorkOrderListQuery, UpdateWorkOrderSchema, IngestWorkOrderSchema,
  TransactionListQuery, DbCockpitQuerySchema
} = require('../../src/shared/validators/workOrder.schemas');

describe('Auth Schemas', () => {

  describe('LoginSchema', () => {
    it('should accept valid credentials', () => {
      const result = LoginSchema.safeParse({ email: 'admin@example.com', password: 'Test1234' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = LoginSchema.safeParse({ email: 'notanemail', password: 'Test1234' });
      expect(result.success).toBe(false);
    });

    it('should reject empty password', () => {
      const result = LoginSchema.safeParse({ email: 'admin@example.com', password: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('SetupSchema — Password Policy', () => {
    const base = { email: 'admin@example.com', display_name: 'Admin', company_name: 'Test Co' };

    it('should accept strong password', () => {
      const result = SetupSchema.safeParse({ ...base, password: 'MyStr0ng!' });
      expect(result.success).toBe(true);
    });

    it('should reject password shorter than 8 chars', () => {
      const result = SetupSchema.safeParse({ ...base, password: 'Ab1' });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('8');
    });

    it('should reject password without uppercase', () => {
      const result = SetupSchema.safeParse({ ...base, password: 'alllower1' });
      expect(result.success).toBe(false);
    });

    it('should reject password without lowercase', () => {
      const result = SetupSchema.safeParse({ ...base, password: 'ALLUPPER1' });
      expect(result.success).toBe(false);
    });

    it('should reject password without digit', () => {
      const result = SetupSchema.safeParse({ ...base, password: 'NoDigitsHere' });
      expect(result.success).toBe(false);
    });
  });

  describe('ChangePasswordSchema', () => {
    it('should accept valid change', () => {
      const result = ChangePasswordSchema.safeParse({
        current_password: 'OldPass1',
        new_password: 'NewStr0ng'
      });
      expect(result.success).toBe(true);
    });

    it('should reject weak new password', () => {
      const result = ChangePasswordSchema.safeParse({
        current_password: 'old',
        new_password: 'weak'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('CreateTenantSchema', () => {
    it('should accept valid tenant', () => {
      const result = CreateTenantSchema.safeParse({
        name: 'Acme Corp',
        domain: 'acme.com'
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing name', () => {
      const result = CreateTenantSchema.safeParse({ domain: 'acme.com' });
      expect(result.success).toBe(false);
    });

    it('should accept tenant with admin_user', () => {
      const result = CreateTenantSchema.safeParse({
        name: 'Acme Corp',
        domain: 'acme.com',
        admin_user: {
          email: 'admin@acme.com',
          password: 'Str0ngPass',
          display_name: 'Admin'
        }
      });
      expect(result.success).toBe(true);
    });

    it('should reject admin_user with weak password', () => {
      const result = CreateTenantSchema.safeParse({
        name: 'Acme Corp',
        domain: 'acme.com',
        admin_user: {
          email: 'admin@acme.com',
          password: 'weak',
          display_name: 'Admin'
        }
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid plan values', () => {
      const result = CreateTenantSchema.safeParse({
        name: 'Test', domain: 'test.com', plan: 'ENTERPRISE'
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid plan value', () => {
      const result = CreateTenantSchema.safeParse({
        name: 'Test', domain: 'test.com', plan: 'INVALID'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('CreateUserSchema', () => {
    it('should accept valid user', () => {
      const result = CreateUserSchema.safeParse({
        email: 'john@example.com',
        password: 'Str0ngPass'
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = CreateUserSchema.safeParse({
        email: 'notanemail',
        password: 'Str0ngPass'
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid roles', () => {
      const r1 = CreateUserSchema.safeParse({ email: 'john@example.com', password: 'Str0ngPass', role: 'TENANT_ADMIN' });
      const r2 = CreateUserSchema.safeParse({ email: 'john@example.com', password: 'Str0ngPass', role: 'TENANT_USER' });
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
    });

    it('should reject invalid role', () => {
      const result = CreateUserSchema.safeParse({
        email: 'john@example.com', password: 'Str0ngPass', role: 'GOD_MODE'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ImpersonateSchema', () => {
    it('should accept valid UUID', () => {
      const result = ImpersonateSchema.safeParse({
        tenant_id: '550e8400-e29b-41d4-a716-446655440000'
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-UUID', () => {
      const result = ImpersonateSchema.safeParse({ tenant_id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('RefreshTokenSchema', () => {
    it('should accept valid token', () => {
      const result = RefreshTokenSchema.safeParse({ refreshToken: 'abc123xyz' });
      expect(result.success).toBe(true);
    });

    it('should reject empty token', () => {
      const result = RefreshTokenSchema.safeParse({ refreshToken: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('ForgotPasswordSchema', () => {
    it('should accept valid email', () => {
      const result = ForgotPasswordSchema.safeParse({ email: 'user@test.com' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = ForgotPasswordSchema.safeParse({ email: 'notanemail' });
      expect(result.success).toBe(false);
    });

    it('should reject empty object', () => {
      const result = ForgotPasswordSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('ResetPasswordSchema', () => {
    it('should accept valid reset', () => {
      const result = ResetPasswordSchema.safeParse({
        token: 'reset-token-123',
        new_password: 'NewStr0ng'
      });
      expect(result.success).toBe(true);
    });

    it('should reject weak new password', () => {
      const result = ResetPasswordSchema.safeParse({
        token: 'token',
        new_password: 'weak'
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('WorkOrder Schemas', () => {

  describe('WorkOrderListQuery', () => {
    it('should accept empty query (defaults applied)', () => {
      const result = WorkOrderListQuery.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.limit).toBe(100);
      expect(result.data.offset).toBe(0);
    });

    it('should coerce string limit to number', () => {
      const result = WorkOrderListQuery.safeParse({ limit: '50' });
      expect(result.success).toBe(true);
      expect(result.data.limit).toBe(50);
    });

    it('should reject limit > 1000', () => {
      const result = WorkOrderListQuery.safeParse({ limit: '9999' });
      expect(result.success).toBe(false);
    });

    it('should reject negative offset', () => {
      const result = WorkOrderListQuery.safeParse({ offset: '-1' });
      expect(result.success).toBe(false);
    });

    it('should accept valid date_from', () => {
      const result = WorkOrderListQuery.safeParse({ date_from: '2026-01-01' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid date_from', () => {
      const result = WorkOrderListQuery.safeParse({ date_from: 'not-a-date' });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateWorkOrderSchema', () => {
    it('should accept valid priority', () => {
      const result = UpdateWorkOrderSchema.safeParse({ priority: 'HIGH' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid priority', () => {
      const result = UpdateWorkOrderSchema.safeParse({ priority: 'CRITICAL' });
      expect(result.success).toBe(false);
    });

    it('should reject notes longer than 2000 chars', () => {
      const result = UpdateWorkOrderSchema.safeParse({ notes: 'x'.repeat(2001) });
      expect(result.success).toBe(false);
    });
  });

  describe('IngestWorkOrderSchema', () => {
    it('should accept valid ingest payload', () => {
      const result = IngestWorkOrderSchema.safeParse({
        sap_delivery_no: '80001234',
        sap_delivery_type: 'LF',
        order_type: 'OUTBOUND',
        lines: [
          { sap_item_no: '10', sap_material: 'MAT001', sap_requested_qty: 100 }
        ]
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing sap_delivery_no', () => {
      const result = IngestWorkOrderSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject negative qty in lines', () => {
      const result = IngestWorkOrderSchema.safeParse({
        sap_delivery_no: '80001234',
        lines: [{ sap_requested_qty: -5 }]
      });
      expect(result.success).toBe(false);
    });
  });

  describe('TransactionListQuery', () => {
    it('should accept valid query', () => {
      const result = TransactionListQuery.safeParse({ limit: '50', status: 'SUCCESS' });
      expect(result.success).toBe(true);
      expect(result.data.limit).toBe(50);
    });

    it('should validate work_order_id as UUID', () => {
      const result = TransactionListQuery.safeParse({ work_order_id: 'not-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('DbCockpitQuerySchema', () => {
    it('should accept valid SQL', () => {
      const result = DbCockpitQuerySchema.safeParse({ sql: 'SELECT 1' });
      expect(result.success).toBe(true);
    });

    it('should reject empty SQL', () => {
      const result = DbCockpitQuerySchema.safeParse({ sql: '' });
      expect(result.success).toBe(false);
    });
  });
});
