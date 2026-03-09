/**
 * Audit Log Interceptor
 *
 * DbStore operasyonlarını intercept ederek audit_logs tablosuna
 * otomatik kayıt atar. Application-level hook yaklaşımı.
 *
 * Kullanım:
 *   const auditStore = auditWrap(new DbStore('work_orders'), 'work_order');
 *   // Artık auditStore.create/update/remove çağrıları otomatik loglanır.
 */
const { query } = require('../database/pool');
const logger = require('../utils/logger');

/**
 * Audit log kaydı oluştur.
 */
async function writeAuditLog(entry) {
  try {
    const sql = `
      INSERT INTO audit_logs (tenant_id, user_id, username, entity_type, entity_id, action, old_values, new_values, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
    `;
    await query(sql, [
      entry.tenant_id || null,
      entry.user_id || null,
      entry.username || null,
      entry.entity_type,
      entry.entity_id || null,
      entry.action,
      entry.old_values ? JSON.stringify(entry.old_values) : null,
      entry.new_values ? JSON.stringify(entry.new_values) : null,
      entry.ip_address || null,
      entry.user_agent || null
    ]);
  } catch (err) {
    // Audit log hatası ana işlemi bloke etmemeli
    logger.error('Audit log write failed', { error: err.message, entry });
  }
}

/**
 * DbStore instance'ını audit wrapper ile sar.
 * req nesnesi her çağrıda iletilmelidir.
 *
 * @param {DbStore} store - Orijinal DbStore instance
 * @param {string} entityType - Audit kaydında kullanılacak entity tipi
 * @returns {Object} - Audit-wrapped store
 */
function auditWrap(store, entityType) {
  return {
    // Passthrough — audit gerekmeyenler
    readAll: store.readAll.bind(store),
    count: store.count.bind(store),
    findById: store.findById.bind(store),
    table: store.table,

    /**
     * CREATE + audit log
     */
    async create(item, req) {
      const result = await store.create(item);
      if (req && req.user) {
        writeAuditLog({
          tenant_id: req.tenantId || item.tenant_id,
          user_id: req.user.user_id,
          username: req.user.username,
          entity_type: entityType,
          entity_id: result.id,
          action: 'CREATE',
          old_values: null,
          new_values: result,
          ip_address: req.ip,
          user_agent: req.headers && req.headers['user-agent']
        });
      }
      return result;
    },

    /**
     * UPDATE + audit log (önceki değerleri kaydeder)
     */
    async update(id, updates, req) {
      // Önceki değerleri al
      let oldValues = null;
      if (req && req.user) {
        oldValues = await store.findById(id);
      }
      const result = await store.update(id, updates);
      if (req && req.user && result) {
        writeAuditLog({
          tenant_id: req.tenantId || (oldValues && oldValues.tenant_id),
          user_id: req.user.user_id,
          username: req.user.username,
          entity_type: entityType,
          entity_id: id,
          action: 'UPDATE',
          old_values: oldValues,
          new_values: result,
          ip_address: req.ip,
          user_agent: req.headers && req.headers['user-agent']
        });
      }
      return result;
    },

    /**
     * REMOVE + audit log
     */
    async remove(id, req) {
      let oldValues = null;
      if (req && req.user) {
        oldValues = await store.findById(id);
      }
      const result = await store.remove(id);
      if (req && req.user) {
        writeAuditLog({
          tenant_id: req.tenantId || (oldValues && oldValues.tenant_id),
          user_id: req.user.user_id,
          username: req.user.username,
          entity_type: entityType,
          entity_id: id,
          action: 'DELETE',
          old_values: oldValues,
          new_values: null,
          ip_address: req.ip,
          user_agent: req.headers && req.headers['user-agent']
        });
      }
      return result;
    }
  };
}

/**
 * Doğrudan audit kaydı at (store'suz durumlar için).
 */
async function logAudit(req, entityType, entityId, action, oldValues, newValues) {
  if (!req || !req.user) return;
  writeAuditLog({
    tenant_id: req.tenantId,
    user_id: req.user.user_id,
    username: req.user.username,
    entity_type: entityType,
    entity_id: entityId,
    action: action,
    old_values: oldValues,
    new_values: newValues,
    ip_address: req.ip,
    user_agent: req.headers && req.headers['user-agent']
  });
}

/**
 * Severity destekli audit kaydi (login, logout, system error vb.)
 */
async function logAuditWithSeverity(options) {
  try {
    const sql = `
      INSERT INTO audit_logs (tenant_id, user_id, username, entity_type, entity_id, action, old_values, new_values, ip_address, user_agent, severity, detail)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12)
    `;
    await query(sql, [
      options.tenant_id || null,
      options.user_id || null,
      options.username || null,
      options.entity_type,
      options.entity_id || null,
      options.action,
      options.old_values ? JSON.stringify(options.old_values) : null,
      options.new_values ? JSON.stringify(options.new_values) : null,
      options.ip_address || null,
      options.user_agent || null,
      options.severity || 'INFO',
      options.detail || null
    ]);
  } catch (err) {
    logger.error('Audit log write failed', { error: err.message });
  }
}

/**
 * Sistem hatasi logla (tenant/user agnostic).
 */
async function logSystemError(entityType, entityId, errorMessage, detail) {
  await logAuditWithSeverity({
    entity_type: entityType || 'system',
    entity_id: entityId,
    action: 'SYSTEM_ERROR',
    severity: 'ERROR',
    detail: detail || errorMessage,
    new_values: { error: errorMessage }
  });
}

module.exports = { auditWrap, logAudit, writeAuditLog, logAuditWithSeverity, logSystemError };
