/**
 * Unit tests for src/shared/middleware/auditLog.js
 */

// ---- Mocks ----
const mockQuery = jest.fn();
jest.mock('../../src/shared/database/pool', () => ({ query: mockQuery }));

const mockLogger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };
jest.mock('../../src/shared/utils/logger', () => mockLogger);

const {
  auditWrap,
  logAudit,
  writeAuditLog,
  logAuditWithSeverity,
  logSystemError
} = require('../../src/shared/middleware/auditLog');

// ---- Helpers ----
const mockReq = (overrides = {}) => ({ headers: {}, ...overrides });
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// writeAuditLog
// =============================================================================
describe('writeAuditLog', () => {
  it('calls pool.query with INSERT INTO audit_logs', async () => {
    mockQuery.mockResolvedValueOnce({});
    const entry = {
      tenant_id: 't1',
      user_id: 'u1',
      username: 'admin',
      entity_type: 'work_order',
      entity_id: '42',
      action: 'CREATE',
      old_values: null,
      new_values: { id: 42, status: 'new' },
      ip_address: '127.0.0.1',
      user_agent: 'jest'
    };

    await writeAuditLog(entry);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO audit_logs');
    expect(params[0]).toBe('t1');
    expect(params[1]).toBe('u1');
    expect(params[2]).toBe('admin');
    expect(params[3]).toBe('work_order');
    expect(params[4]).toBe('42');
    expect(params[5]).toBe('CREATE');
    expect(params[6]).toBeNull(); // old_values
    expect(params[7]).toBe(JSON.stringify({ id: 42, status: 'new' }));
    expect(params[8]).toBe('127.0.0.1');
    expect(params[9]).toBe('jest');
  });

  it('logs error but does not throw when query fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      writeAuditLog({ entity_type: 'x', action: 'CREATE' })
    ).resolves.toBeUndefined();

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Audit log write failed',
      expect.objectContaining({ error: 'connection lost' })
    );
  });

  it('sets nullable fields to null when omitted', async () => {
    mockQuery.mockResolvedValueOnce({});
    await writeAuditLog({ entity_type: 'order', action: 'DELETE' });

    const params = mockQuery.mock.calls[0][1];
    expect(params[0]).toBeNull(); // tenant_id
    expect(params[1]).toBeNull(); // user_id
    expect(params[6]).toBeNull(); // old_values
    expect(params[7]).toBeNull(); // new_values
  });
});

// =============================================================================
// auditWrap
// =============================================================================
describe('auditWrap', () => {
  let store;
  let wrapped;

  beforeEach(() => {
    store = {
      readAll: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findById: jest.fn().mockResolvedValue({ id: 1, status: 'old' }),
      create: jest.fn().mockResolvedValue({ id: 99, status: 'new' }),
      update: jest.fn().mockResolvedValue({ id: 1, status: 'updated' }),
      remove: jest.fn().mockResolvedValue({ id: 1 }),
      table: 'work_orders'
    };
    wrapped = auditWrap(store, 'work_order');
  });

  // -- Passthrough --
  it('readAll delegates to store.readAll', async () => {
    await wrapped.readAll({ limit: 10 });
    expect(store.readAll).toHaveBeenCalledWith({ limit: 10 });
  });

  it('count delegates to store.count', async () => {
    await wrapped.count();
    expect(store.count).toHaveBeenCalled();
  });

  it('findById delegates to store.findById', async () => {
    await wrapped.findById(5);
    expect(store.findById).toHaveBeenCalledWith(5);
  });

  it('exposes store.table', () => {
    expect(wrapped.table).toBe('work_orders');
  });

  // -- create --
  describe('create', () => {
    it('calls store.create and writes audit log with action CREATE', async () => {
      mockQuery.mockResolvedValueOnce({});
      const req = mockReq({
        user: { user_id: 'u1', username: 'alice' },
        tenantId: 't1',
        ip: '10.0.0.1',
        headers: { 'user-agent': 'TestAgent' }
      });

      const result = await wrapped.create({ name: 'item' }, req);

      expect(store.create).toHaveBeenCalledWith({ name: 'item' });
      expect(result).toEqual({ id: 99, status: 'new' });
      // writeAuditLog is fire-and-forget; give it a tick
      await new Promise(r => setImmediate(r));
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO audit_logs');
      expect(params[5]).toBe('CREATE');
    });

    it('does not write audit log without req.user', async () => {
      const result = await wrapped.create({ name: 'item' }, mockReq());

      expect(store.create).toHaveBeenCalled();
      expect(result).toEqual({ id: 99, status: 'new' });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('does not write audit log without req', async () => {
      const result = await wrapped.create({ name: 'item' });
      expect(result).toEqual({ id: 99, status: 'new' });
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -- update --
  describe('update', () => {
    it('fetches old values, calls store.update, and writes audit log with action UPDATE', async () => {
      mockQuery.mockResolvedValueOnce({});
      const req = mockReq({
        user: { user_id: 'u2', username: 'bob' },
        tenantId: 't2',
        ip: '10.0.0.2',
        headers: { 'user-agent': 'Bot' }
      });

      const result = await wrapped.update(1, { status: 'updated' }, req);

      expect(store.findById).toHaveBeenCalledWith(1);
      expect(store.update).toHaveBeenCalledWith(1, { status: 'updated' });
      expect(result).toEqual({ id: 1, status: 'updated' });

      await new Promise(r => setImmediate(r));
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const params = mockQuery.mock.calls[0][1];
      expect(params[5]).toBe('UPDATE');
    });

    it('does not fetch old values or write audit log without req.user', async () => {
      const result = await wrapped.update(1, { status: 'x' }, mockReq());

      expect(store.findById).not.toHaveBeenCalled();
      expect(store.update).toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -- remove --
  describe('remove', () => {
    it('fetches old values, calls store.remove, and writes audit log with action DELETE', async () => {
      mockQuery.mockResolvedValueOnce({});
      const req = mockReq({
        user: { user_id: 'u3', username: 'carol' },
        tenantId: 't3',
        ip: '10.0.0.3',
        headers: { 'user-agent': 'CLI' }
      });

      const result = await wrapped.remove(7, req);

      expect(store.findById).toHaveBeenCalledWith(7);
      expect(store.remove).toHaveBeenCalledWith(7);

      await new Promise(r => setImmediate(r));
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const params = mockQuery.mock.calls[0][1];
      expect(params[5]).toBe('DELETE');
    });

    it('does not write audit log without req.user', async () => {
      await wrapped.remove(7, mockReq());
      expect(store.findById).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// logAudit
// =============================================================================
describe('logAudit', () => {
  it('calls writeAuditLog with provided parameters', async () => {
    mockQuery.mockResolvedValueOnce({});
    const req = mockReq({
      user: { user_id: 'u1', username: 'admin' },
      tenantId: 't1',
      ip: '1.2.3.4',
      headers: { 'user-agent': 'Test' }
    });

    await logAudit(req, 'shipment', 'S-100', 'APPROVE', { status: 'pending' }, { status: 'approved' });

    await new Promise(r => setImmediate(r));
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const params = mockQuery.mock.calls[0][1];
    expect(params[3]).toBe('shipment');
    expect(params[4]).toBe('S-100');
    expect(params[5]).toBe('APPROVE');
  });

  it('returns early when req is null', async () => {
    await logAudit(null, 'shipment', 'S-1', 'CREATE', null, {});
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns early when req.user is undefined', async () => {
    await logAudit(mockReq(), 'shipment', 'S-1', 'CREATE', null, {});
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

// =============================================================================
// logAuditWithSeverity
// =============================================================================
describe('logAuditWithSeverity', () => {
  it('inserts row with severity and detail columns', async () => {
    mockQuery.mockResolvedValueOnce({});
    await logAuditWithSeverity({
      entity_type: 'auth',
      entity_id: 'u5',
      action: 'LOGIN',
      severity: 'WARN',
      detail: 'failed attempt',
      user_id: 'u5',
      username: 'eve'
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO audit_logs');
    expect(sql).toContain('severity');
    expect(sql).toContain('detail');
    expect(params[10]).toBe('WARN');
    expect(params[11]).toBe('failed attempt');
  });

  it('defaults severity to INFO when omitted', async () => {
    mockQuery.mockResolvedValueOnce({});
    await logAuditWithSeverity({
      entity_type: 'config',
      action: 'CHANGE'
    });

    const params = mockQuery.mock.calls[0][1];
    expect(params[10]).toBe('INFO');
  });

  it('logs error but does not throw on query failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    await expect(
      logAuditWithSeverity({ entity_type: 'x', action: 'Y' })
    ).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Audit log write failed',
      expect.objectContaining({ error: 'db down' })
    );
  });
});

// =============================================================================
// logSystemError
// =============================================================================
describe('logSystemError', () => {
  it('calls logAuditWithSeverity with severity ERROR and action SYSTEM_ERROR', async () => {
    mockQuery.mockResolvedValueOnce({});
    await logSystemError('worker', 'job-42', 'timeout exceeded', 'Job ran too long');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const params = mockQuery.mock.calls[0][1];
    expect(params[3]).toBe('worker');       // entity_type
    expect(params[4]).toBe('job-42');       // entity_id
    expect(params[5]).toBe('SYSTEM_ERROR'); // action
    expect(params[10]).toBe('ERROR');       // severity
    expect(params[11]).toBe('Job ran too long'); // detail
  });

  it('uses errorMessage as detail when detail is not provided', async () => {
    mockQuery.mockResolvedValueOnce({});
    await logSystemError('queue', 'q1', 'crash');

    const params = mockQuery.mock.calls[0][1];
    expect(params[11]).toBe('crash');
  });

  it('defaults entity_type to "system" when not provided', async () => {
    mockQuery.mockResolvedValueOnce({});
    await logSystemError(null, null, 'unexpected');

    const params = mockQuery.mock.calls[0][1];
    expect(params[3]).toBe('system');
  });
});
