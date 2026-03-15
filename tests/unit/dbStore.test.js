/**
 * DbStore Unit Tests
 */
const DbStore = require('../../src/shared/database/dbStore');

// Mock the database pool
jest.mock('../../src/shared/database/pool', () => ({
  query: jest.fn()
}));

const { query } = require('../../src/shared/database/pool');

describe('DbStore', () => {
  let store;

  beforeEach(() => {
    store = new DbStore('work_orders');
    query.mockReset();
  });

  describe('constructor', () => {
    it('should set table name', () => {
      const s = new DbStore('warehouses');
      expect(s.table).toBe('warehouses');
    });
  });

  describe('readAll', () => {
    it('should return all rows with no options', async () => {
      const mockRows = [
        { id: '1', status: 'RECEIVED' },
        { id: '2', status: 'IN_PROGRESS' }
      ];
      query.mockResolvedValue({ rows: mockRows });

      const result = await store.readAll();

      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM "work_orders" ORDER BY created_at DESC',
        undefined
      );
      expect(result).toEqual(mockRows);
    });

    it('should apply filter conditions', async () => {
      query.mockResolvedValue({ rows: [] });

      await store.readAll({ filter: { status: 'RECEIVED', tenant_id: 'abc' } });

      const call = query.mock.calls[0];
      expect(call[0]).toContain('WHERE');
      expect(call[0]).toContain('"status" = $1');
      expect(call[0]).toContain('"tenant_id" = $2');
      expect(call[1]).toEqual(['RECEIVED', 'abc']);
    });

    it('should apply limit and offset', async () => {
      query.mockResolvedValue({ rows: [] });

      await store.readAll({ limit: 10, offset: 20 });

      const call = query.mock.calls[0];
      expect(call[0]).toContain('LIMIT $1');
      expect(call[0]).toContain('OFFSET $2');
      expect(call[1]).toEqual([10, 20]);
    });

    it('should skip null/undefined filter values', async () => {
      query.mockResolvedValue({ rows: [] });

      await store.readAll({ filter: { status: 'RECEIVED', type: null, other: undefined } });

      const call = query.mock.calls[0];
      expect(call[0]).toContain('"status" = $1');
      expect(call[0]).not.toContain('"type"');
      expect(call[1]).toEqual(['RECEIVED']);
    });

    it('should use tenant join for process_configs table', async () => {
      const s = new DbStore('process_configs');
      query.mockResolvedValue({ rows: [] });

      await s.readAll();

      const call = query.mock.calls[0];
      expect(call[0]).toContain('LEFT JOIN tenants');
      expect(call[0]).toContain('tenant_code');
    });

    it('should handle sap_field_aliases table specially', async () => {
      const s = new DbStore('sap_field_aliases');
      query.mockResolvedValue({ rows: [{ aliases: { a: 'b' } }] });

      const result = await s.readAll();

      expect(query).toHaveBeenCalledWith('SELECT aliases FROM sap_field_aliases WHERE id = 1');
      expect(result).toEqual({ a: 'b' });
    });

    it('should return empty object for sap_field_aliases with no rows', async () => {
      const s = new DbStore('sap_field_aliases');
      query.mockResolvedValue({ rows: [] });

      const result = await s.readAll();

      expect(result).toEqual({});
    });
  });

  describe('count', () => {
    it('should return count without filter', async () => {
      query.mockResolvedValue({ rows: [{ total: '42' }] });

      const result = await store.count();

      expect(query).toHaveBeenCalledWith(
        'SELECT COUNT(*) AS total FROM "work_orders"',
        undefined
      );
      expect(result).toBe(42);
    });

    it('should return count with filter', async () => {
      query.mockResolvedValue({ rows: [{ total: '5' }] });

      const result = await store.count({ status: 'FAILED' });

      const call = query.mock.calls[0];
      expect(call[0]).toContain('WHERE "status" = $1');
      expect(call[1]).toEqual(['FAILED']);
      expect(result).toBe(5);
    });
  });

  describe('findById', () => {
    it('should return row when found', async () => {
      const mockRow = { id: 'uuid-1', status: 'RECEIVED' };
      query.mockResolvedValue({ rows: [mockRow] });

      const result = await store.findById('uuid-1');

      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM "work_orders" WHERE id = $1',
        ['uuid-1']
      );
      expect(result).toEqual(mockRow);
    });

    it('should return null when not found', async () => {
      query.mockResolvedValue({ rows: [] });

      const result = await store.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findBy', () => {
    it('should find rows by filter', async () => {
      const mockRows = [{ id: '1', status: 'RECEIVED' }];
      query.mockResolvedValue({ rows: mockRows });

      const result = await store.findBy({ status: 'RECEIVED', tenant_id: 'abc' });

      const call = query.mock.calls[0];
      expect(call[0]).toContain('"status" = $1');
      expect(call[0]).toContain('"tenant_id" = $2');
      expect(call[0]).toContain('ORDER BY created_at DESC');
      expect(result).toEqual(mockRows);
    });

    it('should support custom orderBy and limit', async () => {
      query.mockResolvedValue({ rows: [] });

      await store.findBy({ status: 'RECEIVED' }, { orderBy: 'priority ASC', limit: 5 });

      const call = query.mock.calls[0];
      expect(call[0]).toContain('ORDER BY priority ASC');
      expect(call[0]).toContain('LIMIT $2');
    });
  });

  describe('create', () => {
    it('should insert a new row', async () => {
      const newItem = { status: 'RECEIVED', tenant_id: 'abc', sap_delivery_no: '12345' };
      const created = { id: 'uuid-new', ...newItem, created_at: '2026-01-01' };
      query.mockResolvedValue({ rows: [created] });

      const result = await store.create(newItem);

      const call = query.mock.calls[0];
      expect(call[0]).toContain('INSERT INTO "work_orders"');
      expect(call[0]).toContain('RETURNING *');
      expect(result).toEqual(created);
    });

    it('should strip system columns (id, created_at, updated_at)', async () => {
      const newItem = { id: 'should-strip', created_at: 'strip', updated_at: 'strip', status: 'RECEIVED' };
      query.mockResolvedValue({ rows: [{ id: 'auto-uuid', status: 'RECEIVED' }] });

      await store.create(newItem);

      const call = query.mock.calls[0];
      expect(call[0]).not.toContain('"id"');
      expect(call[0]).not.toContain('"created_at"');
      expect(call[0]).not.toContain('"updated_at"');
      expect(call[0]).toContain('"status"');
    });

    it('should serialize JSONB columns', async () => {
      const newItem = { steps: [{ action: 'test' }], status: 'RECEIVED' };
      query.mockResolvedValue({ rows: [{ id: '1', ...newItem }] });

      await store.create(newItem);

      const call = query.mock.calls[0];
      expect(call[0]).toContain('::jsonb');
      expect(call[1][0]).toBe(JSON.stringify([{ action: 'test' }]));
    });

    it('should handle empty data with DEFAULT VALUES', async () => {
      query.mockResolvedValue({ rows: [{ id: 'auto' }] });

      await store.create({ id: 'strip-me' });

      const call = query.mock.calls[0];
      expect(call[0]).toContain('DEFAULT VALUES');
    });
  });

  describe('update', () => {
    it('should update a row by id', async () => {
      const updated = { id: 'uuid-1', status: 'COMPLETED' };
      query.mockResolvedValue({ rows: [updated] });

      const result = await store.update('uuid-1', { status: 'COMPLETED' });

      const call = query.mock.calls[0];
      expect(call[0]).toContain('UPDATE "work_orders"');
      expect(call[0]).toContain('"status" = $1');
      expect(call[0]).toContain('WHERE id = $2');
      expect(call[1]).toEqual(['COMPLETED', 'uuid-1']);
      expect(result).toEqual(updated);
    });

    it('should return null when row not found', async () => {
      query.mockResolvedValue({ rows: [] });

      const result = await store.update('nonexistent', { status: 'X' });

      expect(result).toBeNull();
    });

    it('should call findById when no updates provided', async () => {
      const existing = { id: 'uuid-1', status: 'RECEIVED' };
      query.mockResolvedValue({ rows: [existing] });

      const result = await store.update('uuid-1', { id: 'strip', created_at: 'strip' });

      // Should call findById instead of UPDATE
      expect(query.mock.calls[0][0]).toContain('SELECT * FROM');
    });

    it('should serialize JSONB columns in update', async () => {
      query.mockResolvedValue({ rows: [{ id: '1' }] });

      await store.update('uuid-1', { config: { key: 'val' } });

      const call = query.mock.calls[0];
      expect(call[0]).toContain('::jsonb');
      expect(call[1][0]).toBe(JSON.stringify({ key: 'val' }));
    });
  });

  describe('remove', () => {
    it('should delete a row and return true', async () => {
      query.mockResolvedValue({ rowCount: 1 });

      const result = await store.remove('uuid-1');

      expect(query).toHaveBeenCalledWith(
        'DELETE FROM "work_orders" WHERE id = $1',
        ['uuid-1']
      );
      expect(result).toBe(true);
    });

    it('should return false when row not found', async () => {
      query.mockResolvedValue({ rowCount: 0 });

      const result = await store.remove('nonexistent');

      expect(result).toBe(false);
    });

    it('should throw friendly error on Iron Rule violation', async () => {
      query.mockRejectedValue(new Error('DELETE not allowed on config table'));

      await expect(store.remove('uuid-1')).rejects.toThrow('silinemez');
    });

    it('should re-throw other errors', async () => {
      query.mockRejectedValue(new Error('Connection refused'));

      await expect(store.remove('uuid-1')).rejects.toThrow('Connection refused');
    });
  });
});
