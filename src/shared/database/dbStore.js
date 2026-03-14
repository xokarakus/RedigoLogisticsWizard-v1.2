/**
 * DbStore — PostgreSQL adapter with JsonStore-compatible API
 *
 * Drop-in replacement for JsonStore. Same method names (readAll, findById,
 * create, update, remove) but backed by PostgreSQL instead of JSON files.
 *
 * Key difference: All methods are async (return Promises).
 * Route handlers must use `await` when calling DbStore methods.
 */

const { query } = require('./pool');

// Columns that should be stored as JSONB (not as text)
const JSONB_COLUMNS = new Set([
  'steps', 'config', 'headers', 'sap_sample_json', 'threepl_sample_json',
  'threepl_response_sample_json', 'field_rules', 'response_rules',
  'sap_raw_payload', 'wms_raw_payload', 'sap_request', 'sap_response',
  'edited_payload', 'unit_conversions', 'kit_components', 'wms_serial_numbers',
  'wms_hu_ids', 'discrepancies', 'aliases', 'lines'
]);

// System columns managed by PostgreSQL — never include in INSERT/UPDATE
const SYSTEM_COLUMNS = new Set(['id', 'created_at', 'updated_at']);

class DbStore {
  /**
   * @param {string} tableName — PostgreSQL table name
   */
  constructor(tableName) {
    this.table = tableName;
  }

  /**
   * Read rows from the table with optional pagination and filtering.
   * Backward compatible: readAll() with no args returns all rows.
   * @param {Object} [options]
   * @param {number} [options.limit]  - SQL LIMIT
   * @param {number} [options.offset] - SQL OFFSET
   * @param {Object} [options.filter] - Key-value pairs for WHERE (equality)
   */
  async readAll(options = {}) {
    if (this.table === 'sap_field_aliases') {
      const { rows } = await query('SELECT aliases FROM sap_field_aliases WHERE id = 1');
      return rows.length > 0 ? rows[0].aliases : {};
    }

    const { limit, offset, filter } = options;
    const values = [];
    const whereClauses = [];

    if (filter && typeof filter === 'object') {
      for (const [key, val] of Object.entries(filter)) {
        if (val !== undefined && val !== null) {
          values.push(val);
          whereClauses.push(`"${key}" = $${values.length}`);
        }
      }
    }

    // tenant_id olan tablolara tenant code/name join et
    const tenantJoinTables = ['process_configs', 'process_types', 'warehouses', 'field_mappings', 'movement_mappings', 'security_profiles'];
    const useJoin = tenantJoinTables.includes(this.table);

    let sql;
    if (useJoin) {
      sql = `SELECT t.*, tn.code AS tenant_code, tn.name AS tenant_name FROM "${this.table}" t LEFT JOIN tenants tn ON tn.id = t.tenant_id`;
    } else {
      sql = `SELECT * FROM "${this.table}"`;
    }
    if (whereClauses.length > 0) {
      // Join modunda alias kullan
      const prefix = useJoin ? whereClauses.map(c => 't.' + c) : whereClauses;
      sql += ' WHERE ' + prefix.join(' AND ');
    }
    sql += useJoin ? ' ORDER BY t.created_at DESC' : ' ORDER BY created_at DESC';

    if (limit != null) {
      values.push(Number(limit));
      sql += ` LIMIT $${values.length}`;
    }
    if (offset != null) {
      values.push(Number(offset));
      sql += ` OFFSET $${values.length}`;
    }

    const { rows } = await query(sql, values.length > 0 ? values : undefined);
    return rows;
  }

  /**
   * Count rows in the table with optional filtering.
   * @param {Object} [filter] - Key-value pairs for WHERE (equality)
   * @returns {Promise<number>}
   */
  async count(filter) {
    const values = [];
    const whereClauses = [];

    if (filter && typeof filter === 'object') {
      for (const [key, val] of Object.entries(filter)) {
        if (val !== undefined && val !== null) {
          values.push(val);
          whereClauses.push(`"${key}" = $${values.length}`);
        }
      }
    }

    let sql = `SELECT COUNT(*) AS total FROM "${this.table}"`;
    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    const { rows } = await query(sql, values.length > 0 ? values : undefined);
    return Number(rows[0].total);
  }

  /**
   * Find a single row by id.
   */
  async findById(id) {
    const { rows } = await query(
      `SELECT * FROM "${this.table}" WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Find rows by filter with SQL WHERE (index-friendly).
   * Unlike readAll(), this is optimized for indexed lookups.
   * @param {Object} filter - Key-value pairs for WHERE (equality)
   * @param {Object} [options]
   * @param {number} [options.limit]
   * @param {string} [options.orderBy] - e.g. 'created_at DESC'
   * @returns {Promise<Array>}
   */
  async findBy(filter, options = {}) {
    const { limit, orderBy } = options;
    const values = [];
    const clauses = [];

    for (const [key, val] of Object.entries(filter)) {
      if (val !== undefined && val !== null) {
        values.push(val);
        clauses.push(`"${key}" = $${values.length}`);
      }
    }

    let sql = `SELECT * FROM "${this.table}"`;
    if (clauses.length > 0) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY ' + (orderBy || 'created_at DESC');
    if (limit) {
      values.push(limit);
      sql += ` LIMIT $${values.length}`;
    }

    const { rows } = await query(sql, values.length > 0 ? values : undefined);
    return rows;
  }

  /**
   * Insert a new row. Returns the created row with generated UUID.
   * Does NOT generate its own id — PostgreSQL gen_random_uuid() handles it.
   */
  async create(item) {
    const data = { ...item };

    // Remove system columns — let PostgreSQL handle them
    for (const col of SYSTEM_COLUMNS) {
      delete data[col];
    }

    const keys = Object.keys(data);
    if (keys.length === 0) {
      // Insert with only defaults
      const { rows } = await query(
        `INSERT INTO "${this.table}" DEFAULT VALUES RETURNING *`
      );
      return rows[0];
    }

    const columns = keys.map(k => `"${k}"`).join(', ');
    const placeholders = keys.map((k, i) => {
      if (JSONB_COLUMNS.has(k) && typeof data[k] === 'object') {
        return `$${i + 1}::jsonb`;
      }
      return `$${i + 1}`;
    }).join(', ');
    const values = keys.map(k => {
      if (JSONB_COLUMNS.has(k) && typeof data[k] === 'object') {
        return JSON.stringify(data[k]);
      }
      return data[k];
    });

    const { rows } = await query(
      `INSERT INTO "${this.table}" (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return rows[0];
  }

  /**
   * Update a row by id. Returns the updated row or null if not found.
   */
  async update(id, updates) {
    const data = { ...updates };

    // Remove system columns
    for (const col of SYSTEM_COLUMNS) {
      delete data[col];
    }

    const keys = Object.keys(data);
    if (keys.length === 0) return this.findById(id);

    const setClauses = keys.map((k, i) => {
      if (JSONB_COLUMNS.has(k) && typeof data[k] === 'object') {
        return `"${k}" = $${i + 1}::jsonb`;
      }
      return `"${k}" = $${i + 1}`;
    }).join(', ');

    const values = keys.map(k => {
      if (JSONB_COLUMNS.has(k) && typeof data[k] === 'object') {
        return JSON.stringify(data[k]);
      }
      return data[k];
    });

    values.push(id);

    const { rows } = await query(
      `UPDATE "${this.table}" SET ${setClauses} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return rows[0] || null;
  }

  /**
   * Delete a row by id. Returns true if deleted, false if not found.
   * Note: Iron Rule triggers will throw on config tables — caller should catch.
   */
  async remove(id) {
    try {
      const { rowCount } = await query(
        `DELETE FROM "${this.table}" WHERE id = $1`,
        [id]
      );
      return rowCount > 0;
    } catch (err) {
      // Iron Rule trigger: "DELETE not allowed on %. Use is_active = false to archive."
      if (err.message && err.message.includes('DELETE not allowed')) {
        throw new Error('Bu kayıt silinemez. is_active = false ile arşivleyin.');
      }
      throw err;
    }
  }
}

module.exports = DbStore;
