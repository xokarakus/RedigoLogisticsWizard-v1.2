const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');
const { requireScope } = require('../../shared/middleware/auth');
const logger = require('../../shared/utils/logger');
const { maskCredentials, isMasked, SENSITIVE_KEYS } = require('../../shared/utils/securityUtils');
const { logAudit } = require('../../shared/middleware/auditLog');

const adminOnly = requireScope('Admin');
const { tenantFilter } = require('../../shared/middleware/auth');
const { fieldMappingCache } = require('../../shared/utils/cacheStore');

const { validate } = require('../../shared/validators/middleware');
const {
  CreateWarehouseSchema, UpdateWarehouseSchema,
  CreateFieldMappingSchema, UpdateFieldMappingSchema,
  CreateSecurityProfileSchema, UpdateSecurityProfileSchema,
  TestDispatchSchema, EmailTestSchema, ApplyTemplateSchema,
  CreateProviderTemplateSchema, UpdateProviderTemplateSchema, ExportTenantTemplateSchema
} = require('../../shared/validators/config.schemas');

const warehouseStore = new DbStore('warehouses');
const fieldMappingStore = new DbStore('field_mappings');
const securityStore = new DbStore('security_profiles');
const aliasStore = new DbStore('sap_field_aliases');

/**
 * Tenant-scoped filter helper.
 * Super admin tum tenant'lari gorur, diger kullanicilar sadece kendi tenant'larini.
 */
function tf(req) {
  return tenantFilter(req);
}

/* ═══════════════════════════════════════════
   Depolar (Warehouses) CRUD
   ═══════════════════════════════════════════ */

router.get('/warehouses', async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const opts = { filter: tf(req) };
    if (limit) opts.limit = Number(limit);
    if (offset) opts.offset = Number(offset);
    res.json({ data: await warehouseStore.readAll(opts) });
  } catch (err) {
    logger.error('GET /config/warehouses error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/warehouses', adminOnly, validate(CreateWarehouseSchema), async (req, res) => {
  try {
    const item = await warehouseStore.create({ ...req.body, tenant_id: req.tenantId });
    logAudit(req, 'warehouse', item.id, 'CREATE', null, item);
    res.status(201).json({ data: item });
  } catch (err) {
    logger.error('POST /config/warehouses error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/warehouses/:id', adminOnly, validate(UpdateWarehouseSchema), async (req, res) => {
  try {
    const old = await warehouseStore.findById(req.params.id);
    const updated = await warehouseStore.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
    logAudit(req, 'warehouse', req.params.id, 'UPDATE', old, updated);
    res.json({ data: updated });
  } catch (err) {
    logger.error('PUT /config/warehouses error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/warehouses/:id', adminOnly, async (req, res) => {
  try {
    const old = await warehouseStore.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Kayit bulunamadi' });
    await warehouseStore.remove(req.params.id);
    logAudit(req, 'warehouse', req.params.id, 'DELETE', old, null);
    res.json({ success: true });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   Alan Eşleştirmeleri (Field Mappings) CRUD
   ═══════════════════════════════════════════ */

router.get('/field-mappings', async (req, res) => {
  try {
    const { company_code, limit, offset } = req.query;
    const opts = { filter: { ...tf(req) } };
    if (company_code) opts.filter.company_code = company_code;
    if (limit) opts.limit = Number(limit);
    if (offset) opts.offset = Number(offset);
    const data = await fieldMappingStore.readAll(opts);
    res.json({ data });
  } catch (err) {
    logger.error('GET /config/field-mappings error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/field-mappings', adminOnly, validate(CreateFieldMappingSchema), async (req, res) => {
  try {
    const item = await fieldMappingStore.create({ ...req.body, tenant_id: req.tenantId });
    fieldMappingCache.invalidate();
    logAudit(req, 'field_mapping', item.id, 'CREATE', null, item);
    res.status(201).json({ data: item });
  } catch (err) {
    logger.error('POST /config/field-mappings error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/field-mappings/:id', adminOnly, validate(UpdateFieldMappingSchema), async (req, res) => {
  try {
    const old = await fieldMappingStore.findById(req.params.id);
    const updated = await fieldMappingStore.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
    fieldMappingCache.invalidate();
    logAudit(req, 'field_mapping', req.params.id, 'UPDATE', old, updated);
    res.json({ data: updated });
  } catch (err) {
    logger.error('PUT /config/field-mappings error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/field-mappings/:id', adminOnly, async (req, res) => {
  try {
    const old = await fieldMappingStore.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Kayit bulunamadi' });
    await fieldMappingStore.remove(req.params.id);
    fieldMappingCache.invalidate();
    logAudit(req, 'field_mapping', req.params.id, 'DELETE', old, null);
    res.json({ success: true });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   Güvenlik Profilleri (Security Profiles) CRUD
   ═══════════════════════════════════════════ */

router.get('/security-profiles', async (req, res) => {
  try {
    const { company_code, limit, offset } = req.query;
    const opts = { filter: { ...tf(req) } };
    if (company_code) opts.filter.company_code = company_code;
    if (limit) opts.limit = Number(limit);
    if (offset) opts.offset = Number(offset);
    const data = await securityStore.readAll(opts);
    res.json({ data: data.map(maskCredentials) });
  } catch (err) {
    logger.error('GET /config/security-profiles error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/security-profiles', adminOnly, validate(CreateSecurityProfileSchema), async (req, res) => {
  try {
    const item = await securityStore.create({ ...req.body, tenant_id: req.tenantId });
    logAudit(req, 'security_profile', item.id, 'CREATE', null, maskCredentials(item));
    res.status(201).json({ data: maskCredentials(item) });
  } catch (err) {
    logger.error('POST /config/security-profiles error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/security-profiles/:id', adminOnly, validate(UpdateSecurityProfileSchema), async (req, res) => {
  try {
    const old = await securityStore.findById(req.params.id);
    const payload = { ...req.body };

    // Merge: masked ("******") credential → preserve existing DB value
    if (payload.config && typeof payload.config === 'object') {
      const hasMasked = Object.entries(payload.config)
        .some(([k, v]) => SENSITIVE_KEYS.has(k) && isMasked(v));
      if (hasMasked) {
        if (old && old.config) {
          const merged = { ...payload.config };
          for (const key of SENSITIVE_KEYS) {
            if (isMasked(merged[key]) && old.config[key] !== undefined) {
              merged[key] = old.config[key];
            }
          }
          payload.config = merged;
        }
      }
    }

    const updated = await securityStore.update(req.params.id, payload);
    if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
    logAudit(req, 'security_profile', req.params.id, 'UPDATE', maskCredentials(old), maskCredentials(updated));
    res.json({ data: maskCredentials(updated) });
  } catch (err) {
    logger.error('PUT /config/security-profiles error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/security-profiles/:id', adminOnly, async (req, res) => {
  try {
    const old = await securityStore.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Kayit bulunamadi' });
    await securityStore.remove(req.params.id);
    logAudit(req, 'security_profile', req.params.id, 'DELETE', maskCredentials(old), null);
    res.json({ success: true });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   SAP Alan Alias Sözlüğü
   ═══════════════════════════════════════════ */

router.get('/sap-field-aliases', async (req, res) => {
  try {
    res.json({ data: await aliasStore.readAll() });
  } catch (err) {
    logger.error('GET /config/sap-field-aliases error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ═══════════════════════════════════════════
   Test Dispatch (proxy — CORS bypass + security profile)
   ═══════════════════════════════════════════ */

const { dispatch } = require('../../shared/utils/httpDispatcher');
const { applyResponseRules } = require('../../shared/utils/fieldTransformer');

router.post('/test-dispatch', adminOnly, validate(TestDispatchSchema), async (req, res) => {
  const { url, method, headers, securityProfileId, body, responseRules } = req.body;
  try {
    const result = await dispatch({
      url,
      method: method || 'GET',
      headers: headers || [],
      securityProfileId: securityProfileId || null,
      body: body || null
    });

    let transformedResponse = null;
    if (responseRules && responseRules.length > 0 && result.responseBody) {
      try {
        transformedResponse = applyResponseRules(result.responseBody, responseRules);
      } catch (_) { /* transform hatası — ham yanıtı döndür */ }
    }

    res.json({ data: { ...result, transformedResponse } });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ═══════════════════════════════════════════
   System Settings (E-posta vb.)
   ═══════════════════════════════════════════ */
const { query: dbQuery } = require('../../shared/database/pool');

router.get('/settings/:key', adminOnly, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { rows } = await dbQuery(
      'SELECT value FROM system_settings WHERE tenant_id = $1 AND key = $2',
      [tenantId, req.params.key]
    );
    res.json({ data: rows.length > 0 ? rows[0].value : null });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/settings/:key', adminOnly, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const key = req.params.key;
    const value = req.body.value;
    await dbQuery(
      `INSERT INTO system_settings (tenant_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, key) DO UPDATE SET value = $3, updated_at = now()`,
      [tenantId, key, JSON.stringify(value)]
    );
    // E-posta ayarları değişirse emailService cache'ini temizle
    if (key === 'email') {
      const emailService = require('../../shared/utils/emailService');
      emailService.resetTransporter();
    }
    logAudit(req, 'system_settings', key, 'UPDATE', null, { key, value: key === 'email' ? '***' : value });
    res.json({ message: 'Ayar kaydedildi' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test e-posta gönderimi
router.post('/settings/email/test', adminOnly, validate(EmailTestSchema), async (req, res) => {
  try {
    const { to } = req.body;
    const emailService = require('../../shared/utils/emailService');
    const sent = await emailService.sendEmail(
      to,
      'Redigo Logistics — E-posta Test',
      '<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">' +
        '<h2 style="color:#0854A0;">E-posta Ayarları Doğrulandı</h2>' +
        '<p>Bu bir test e-postasıdır. SMTP ayarlarınız başarıyla çalışıyor.</p>' +
        '<hr style="border:none;border-top:1px solid #eee;"><p style="color:#999;font-size:11px;">Redigo Logistics Cockpit</p></div>',
      req.tenantId
    );
    if (sent) {
      res.json({ message: 'Test e-postası gönderildi: ' + to });
    } else {
      res.status(500).json({ error: 'E-posta gönderilemedi. SMTP ayarlarını kontrol edin.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ═══════════════════════════════════════════
   Konfigürasyon Sihirbazı (Configuration Wizard)
   ═══════════════════════════════════════════ */

const { requireRole } = require('../../shared/middleware/auth');
const { getProviders, getTemplateEntities, applyTemplate, exportTenantConfig, templateStore, HOROZ_SUB_CODES } = require('./wizardHelper');
const { getClient } = require('../../shared/database/pool');

// GET /config/wizard/providers — list available logistics provider templates
// ?tenant_id=xxx eklenmisse, o tenant icin daha once uygulanan template'leri isaretler
router.get('/wizard/providers', requireRole('TENANT_ADMIN'), async (req, res) => {
  try {
    const data = await getProviders();
    const tenantId = req.query.tenant_id || req.tenantId;

    // Tenant icin daha once uygulanan template'leri audit_logs'dan cek
    let appliedProviders = [];
    if (tenantId) {
      const auditResult = await dbQuery(
        `SELECT new_values->>'provider_code' AS provider_code,
                new_values->>'sub_services' AS sub_services,
                created_at
         FROM audit_logs
         WHERE entity_type = 'wizard' AND action = 'APPLY_TEMPLATE'
           AND (new_values->>'provider_code') IS NOT NULL
           AND tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
      );
      appliedProviders = auditResult.rows.map(r => ({
        provider_code: r.provider_code,
        sub_services: r.sub_services ? JSON.parse(r.sub_services) : [],
        applied_at: r.created_at
      }));
    }

    // Her provider'a applied bilgisi ekle
    data.forEach(p => {
      const applied = appliedProviders.find(a => a.provider_code === p.code);
      if (applied) {
        p.already_applied = true;
        p.applied_at = applied.applied_at;
        p.applied_sub_services = applied.sub_services;
      } else {
        p.already_applied = false;
      }
    });

    res.json({ data, applied_providers: appliedProviders });
  } catch (err) {
    logger.error('GET /config/wizard/providers error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /config/wizard/preview?provider=ABC_LOG&sub_services=HOROZ,HOROZ_DIST
router.get('/wizard/preview', requireRole('TENANT_ADMIN'), async (req, res) => {
  try {
    const { provider, sub_services } = req.query;
    if (!provider) {
      return res.status(400).json({ error: 'provider parametresi zorunlu' });
    }
    const subArr = sub_services ? sub_services.split(',').map(s => s.trim()) : [];
    const result = await getTemplateEntities(provider, subArr);
    res.json({ provider, ...result });
  } catch (err) {
    logger.error('GET /config/wizard/preview error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /config/wizard/apply — bulk-create config for a tenant
router.post('/wizard/apply', requireRole('TENANT_ADMIN'), validate(ApplyTemplateSchema), async (req, res) => {
  const { provider_code, sub_services } = req.body;
  // SUPER_ADMIN body'den tenant_id gönderebilir, diğerleri kendi tenant'ına uygular
  const isSuperAdmin = req.user && req.user.is_super_admin === true;
  const tenant_id = isSuperAdmin ? (req.body.tenant_id || req.tenantId) : req.tenantId;
  if (!tenant_id) {
    return res.status(400).json({ error: 'tenant_id zorunlu' });
  }

  const client = await getClient();
  try {
    // Verify tenant exists
    const { rows: tenants } = await client.query('SELECT id, name FROM tenants WHERE id = $1', [tenant_id]);
    if (tenants.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Tenant bulunamadı' });
    }

    // Ayni template ayni tenant'a tekrar uygulanamaz
    const { rows: alreadyApplied } = await client.query(
      `SELECT id FROM audit_logs
       WHERE entity_type = 'wizard' AND action = 'APPLY_TEMPLATE'
         AND tenant_id = $1
         AND new_values->>'provider_code' = $2
       LIMIT 1`,
      [tenant_id, provider_code]
    );
    if (alreadyApplied.length > 0) {
      client.release();
      return res.status(409).json({ error: 'Bu şablon daha önce bu şirkete uygulanmış. Aynı şablon tekrar uygulanamaz.' });
    }

    // Check existing config count
    const { rows: existCheck } = await client.query(
      'SELECT COUNT(*) as cnt FROM warehouses WHERE tenant_id = $1',
      [tenant_id]
    );
    const hasExisting = Number(existCheck[0].cnt) > 0;

    // Get template entities
    const entities = await getTemplateEntities(provider_code, sub_services || []);

    await client.query('BEGIN');
    const result = await applyTemplate(client, tenant_id, entities);
    await client.query('COMMIT');

    // Invalidate caches
    fieldMappingCache.invalidate();

    // Audit log
    logAudit(req, 'wizard', tenant_id, 'APPLY_TEMPLATE', null, {
      provider_code,
      sub_services: sub_services || [],
      counts: result.counts,
      had_existing: hasExisting
    });

    const totalCreated = Object.values(result.counts).reduce((a, b) => a + b, 0);

    res.json({
      message: `Şablon başarıyla uygulandı. ${totalCreated} kayıt oluşturuldu.`,
      tenant: tenants[0].name,
      provider: provider_code,
      had_existing: hasExisting,
      counts: result.counts
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('POST /config/wizard/apply error', { error: err.message, tenant_id, provider_code });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/* ═══════════════════════════════════════════
   Provider Template CRUD (SUPER_ADMIN only)
   ═══════════════════════════════════════════ */

// POST /config/wizard/providers — yeni provider template oluştur
router.post('/wizard/providers', requireRole('SUPER_ADMIN'), validate(CreateProviderTemplateSchema), async (req, res) => {
  try {
    const data = { ...req.body, is_active: req.body.is_active !== false };
    const created = await templateStore.create(data);
    logAudit(req, 'provider_template', created.id, 'CREATE', null, data);
    res.status(201).json({ data: created });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Bu code ile template zaten mevcut' });
    }
    logger.error('POST /config/wizard/providers error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /config/wizard/providers/:id — template güncelle
router.put('/wizard/providers/:id', requireRole('SUPER_ADMIN'), validate(UpdateProviderTemplateSchema), async (req, res) => {
  try {
    const existing = await templateStore.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Template bulunamadı' });
    const updated = await templateStore.update(req.params.id, req.body);
    logAudit(req, 'provider_template', req.params.id, 'UPDATE', existing, req.body);
    res.json({ data: updated });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Bu code ile template zaten mevcut' });
    }
    logger.error('PUT /config/wizard/providers error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /config/wizard/providers/:id — template sil
router.delete('/wizard/providers/:id', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const existing = await templateStore.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Template bulunamadı' });
    await templateStore.remove(req.params.id);
    logAudit(req, 'provider_template', req.params.id, 'DELETE', existing, null);
    res.json({ success: true });
  } catch (err) {
    logger.error('DELETE /config/wizard/providers error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /config/wizard/providers/from-tenant — mevcut tenant config'inden şablon çıkar
router.post('/wizard/providers/from-tenant', requireRole('SUPER_ADMIN'), validate(ExportTenantTemplateSchema), async (req, res) => {
  try {
    const { code, name, description } = req.body;
    const tenant_id = req.body.tenant_id || req.user.tenant_id;
    const templateData = await exportTenantConfig(tenant_id);
    const totalEntities = Object.values(templateData).reduce((sum, arr) => sum + arr.length, 0);
    if (totalEntities === 0) {
      return res.status(400).json({ error: 'Bu tenant için dışa aktarılacak konfigürasyon bulunamadı' });
    }
    const data = {
      code,
      name,
      description: description || null,
      template_data: templateData,
      is_active: true
    };
    const created = await templateStore.create(data);
    logAudit(req, 'provider_template', created.id, 'EXPORT_FROM_TENANT', null, {
      tenant_id,
      code,
      counts: {
        warehouses: templateData.warehouses.length,
        field_mappings: templateData.field_mappings.length
      }
    });
    res.status(201).json({ data: created, counts: {
      warehouses: templateData.warehouses.length,
      field_mappings: templateData.field_mappings.length
    }});
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Bu code ile template zaten mevcut' });
    }
    logger.error('POST /config/wizard/providers/from-tenant error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ══════════════════════════════════════
// Feature Flags
// ══════════════════════════════════════
const featureFlags = require('../../shared/utils/featureFlags');

// GET /config/feature-flags — Tum flag'leri getir
router.get('/feature-flags', async (req, res) => {
  try {
    const tenantId = req.tenantId || (req.user && req.user.tenant_id) || null;
    const flags = await featureFlags.getAll(tenantId);
    res.json({ data: flags });
  } catch (err) {
    logger.error('GET /config/feature-flags error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /config/feature-flags/:key — Flag guncelle
router.put('/feature-flags/:key', adminOnly, async (req, res) => {
  try {
    const { enabled, description, metadata, tenant_id } = req.body;
    const flagTenantId = tenant_id || req.tenantId || (req.user && req.user.tenant_id) || null;

    await featureFlags.setFlag(req.params.key, !!enabled, flagTenantId, { description, metadata });
    logAudit(req, 'feature_flag', req.params.key, 'UPDATE', null, { enabled, tenant_id: flagTenantId });
    res.json({ ok: true, flag_key: req.params.key, enabled: !!enabled });
  } catch (err) {
    logger.error('PUT /config/feature-flags error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /config/feature-flags/:key — Flag sil
router.delete('/feature-flags/:key', adminOnly, async (req, res) => {
  try {
    const tenantId = req.tenantId || (req.user && req.user.tenant_id) || null;
    await featureFlags.removeFlag(req.params.key, tenantId);
    logAudit(req, 'feature_flag', req.params.key, 'DELETE', null, null);
    res.json({ ok: true });
  } catch (err) {
    logger.error('DELETE /config/feature-flags error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
