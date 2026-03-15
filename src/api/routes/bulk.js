/**
 * Bulk Operations API
 *
 * Toplu islemler icin endpoint'ler.
 * Max 500 kayit, atomik veya partial basari destegi.
 */
const express = require('express');
const router = express.Router();
const { z } = require('zod');
const DbStore = require('../../shared/database/dbStore');
const { tenantFilter, requireRole } = require('../../shared/middleware/auth');
const { validate } = require('../../shared/validators/middleware');
const { idempotency } = require('../../shared/middleware/idempotency');
const { writeAuditLog } = require('../../shared/middleware/auditLog');
const logger = require('../../shared/utils/logger');

const MAX_BULK_SIZE = 500;

// ── Schemas ──
const BulkUpdateSchema = z.object({
  entity: z.enum(['work_orders', 'materials', 'business_partners']),
  operations: z.array(z.object({
    id: z.string().uuid(),
    updates: z.record(z.any())
  })).min(1).max(MAX_BULK_SIZE)
});

const BulkDeleteSchema = z.object({
  entity: z.enum(['work_orders', 'materials', 'business_partners']),
  ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_SIZE)
});

const BulkStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_SIZE),
  status: z.string().max(30)
});

const adminOnly = requireRole('TENANT_ADMIN');
function tf(req) { return tenantFilter(req); }

// ── POST /bulk/update — Toplu guncelleme ──
router.post('/update', adminOnly, idempotency(), validate(BulkUpdateSchema), async (req, res) => {
  const { entity, operations } = req.body;
  const store = new DbStore(entity);
  const results = { success: 0, failed: 0, errors: [] };

  for (const op of operations) {
    try {
      const existing = await store.findById(op.id);
      if (!existing) {
        results.failed++;
        results.errors.push({ id: op.id, error: 'Kayit bulunamadi' });
        continue;
      }

      // Tenant kontrolu
      const filter = tf(req);
      if (filter.tenant_id && existing.tenant_id !== filter.tenant_id) {
        results.failed++;
        results.errors.push({ id: op.id, error: 'Yetkisiz erisim' });
        continue;
      }

      await store.update(op.id, op.updates);
      results.success++;

      writeAuditLog({
        tenant_id: req.tenantId || req.user.tenant_id,
        user_id: req.user.user_id,
        username: req.user.username,
        action: 'BULK_UPDATE',
        entity_type: entity,
        entity_id: op.id,
        new_values: op.updates,
        ip_address: req.ip,
        severity: 'INFO'
      });
    } catch (err) {
      results.failed++;
      results.errors.push({ id: op.id, error: err.message });
    }
  }

  res.json({
    ok: results.failed === 0,
    total: operations.length,
    ...results
  });
});

// ── POST /bulk/status — Toplu status guncelleme ──
router.post('/status', adminOnly, idempotency(), validate(BulkStatusSchema), async (req, res) => {
  const { ids, status } = req.body;
  const store = new DbStore('work_orders');
  const results = { success: 0, failed: 0, errors: [] };

  for (const id of ids) {
    try {
      const existing = await store.findById(id);
      if (!existing) {
        results.failed++;
        results.errors.push({ id, error: 'Kayit bulunamadi' });
        continue;
      }
      const filter = tf(req);
      if (filter.tenant_id && existing.tenant_id !== filter.tenant_id) {
        results.failed++;
        results.errors.push({ id, error: 'Yetkisiz erisim' });
        continue;
      }
      await store.update(id, { status });
      results.success++;
    } catch (err) {
      results.failed++;
      results.errors.push({ id, error: err.message });
    }
  }

  res.json({
    ok: results.failed === 0,
    total: ids.length,
    ...results
  });
});

// ── POST /bulk/delete — Toplu silme ──
router.post('/delete', adminOnly, idempotency(), validate(BulkDeleteSchema), async (req, res) => {
  const { entity, ids } = req.body;
  const store = new DbStore(entity);
  const results = { success: 0, failed: 0, errors: [] };

  for (const id of ids) {
    try {
      const existing = await store.findById(id);
      if (!existing) {
        results.failed++;
        results.errors.push({ id, error: 'Kayit bulunamadi' });
        continue;
      }
      const filter = tf(req);
      if (filter.tenant_id && existing.tenant_id !== filter.tenant_id) {
        results.failed++;
        results.errors.push({ id, error: 'Yetkisiz erisim' });
        continue;
      }
      await store.remove(id);
      results.success++;

      writeAuditLog({
        tenant_id: req.tenantId || req.user.tenant_id,
        user_id: req.user.user_id,
        username: req.user.username,
        action: 'BULK_DELETE',
        entity_type: entity,
        entity_id: id,
        old_values: existing,
        ip_address: req.ip,
        severity: 'WARNING'
      });
    } catch (err) {
      results.failed++;
      results.errors.push({ id, error: err.message });
    }
  }

  res.json({
    ok: results.failed === 0,
    total: ids.length,
    ...results
  });
});

module.exports = router;
