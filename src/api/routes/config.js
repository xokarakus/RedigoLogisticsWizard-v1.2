const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');
const { requireScope } = require('../../shared/middleware/auth');
const logger = require('../../shared/utils/logger');
const { maskCredentials, isMasked, SENSITIVE_KEYS } = require('../../shared/utils/securityUtils');
const { logAudit } = require('../../shared/middleware/auditLog');

const adminOnly = requireScope('Admin');
const { tenantFilter } = require('../../shared/middleware/auth');
const { fieldMappingCache, processTypeCache, processConfigCache } = require('../../shared/utils/cacheStore');

const { validate } = require('../../shared/validators/middleware');
const {
  CreateWarehouseSchema, UpdateWarehouseSchema,
  CreateMappingSchema, UpdateMappingSchema,
  CreateProcessConfigSchema, UpdateProcessConfigSchema,
  CreateProcessTypeSchema, UpdateProcessTypeSchema,
  CreateFieldMappingSchema, UpdateFieldMappingSchema,
  CreateSecurityProfileSchema, UpdateSecurityProfileSchema,
  TestDispatchSchema, EmailTestSchema, ApplyTemplateSchema
} = require('../../shared/validators/config.schemas');

const configStore = new DbStore('process_configs');
const typeStore = new DbStore('process_types');
const warehouseStore = new DbStore('warehouses');
const mappingStore = new DbStore('movement_mappings');
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
    res.status(500).json({ error: err.message });
  }
});

router.post('/warehouses', adminOnly, validate(CreateWarehouseSchema), async (req, res) => {
  try {
    const item = await warehouseStore.create({ ...req.body, tenant_id: req.tenantId });
    logAudit(req, 'warehouse', item.id, 'CREATE', null, item);
    res.status(201).json({ data: item });
  } catch (err) {
    logger.error('POST /config/warehouses error', { error: err.message });
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
   Hareket Eslemeleri (Mappings) CRUD
   ═══════════════════════════════════════════ */

router.get('/mappings', async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const opts = { filter: tf(req) };
    if (limit) opts.limit = Number(limit);
    if (offset) opts.offset = Number(offset);
    res.json({ data: await mappingStore.readAll(opts) });
  } catch (err) {
    logger.error('GET /config/mappings error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/mappings', adminOnly, validate(CreateMappingSchema), async (req, res) => {
  try {
    const item = await mappingStore.create({ ...req.body, tenant_id: req.tenantId });
    logAudit(req, 'movement_mapping', item.id, 'CREATE', null, item);
    res.status(201).json({ data: item });
  } catch (err) {
    logger.error('POST /config/mappings error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/mappings/:id', adminOnly, validate(UpdateMappingSchema), async (req, res) => {
  try {
    const old = await mappingStore.findById(req.params.id);
    const updated = await mappingStore.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
    logAudit(req, 'movement_mapping', req.params.id, 'UPDATE', old, updated);
    res.json({ data: updated });
  } catch (err) {
    logger.error('PUT /config/mappings error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/mappings/:id', adminOnly, async (req, res) => {
  try {
    const old = await mappingStore.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Kayit bulunamadi' });
    await mappingStore.remove(req.params.id);
    logAudit(req, 'movement_mapping', req.params.id, 'DELETE', old, null);
    res.json({ success: true });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   Süreç Uyarlamaları (Process Configs) CRUD
   ═══════════════════════════════════════════ */

router.get('/process-configs', async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const opts = { filter: tf(req) };
    if (limit) opts.limit = Number(limit);
    if (offset) opts.offset = Number(offset);
    res.json({ data: await configStore.readAll(opts) });
  } catch (err) {
    logger.error('GET /config/process-configs error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/process-configs', adminOnly, validate(CreateProcessConfigSchema), async (req, res) => {
  try {
    const item = await configStore.create({ ...req.body, tenant_id: req.tenantId });
    processConfigCache.invalidate();
    logAudit(req, 'process_config', item.id, 'CREATE', null, item);
    res.status(201).json({ data: item });
  } catch (err) {
    logger.error('POST /config/process-configs error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/process-configs/:id', adminOnly, validate(UpdateProcessConfigSchema), async (req, res) => {
  try {
    const old = await configStore.findById(req.params.id);
    const updated = await configStore.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
    processConfigCache.invalidate();
    logAudit(req, 'process_config', req.params.id, 'UPDATE', old, updated);
    res.json({ data: updated });
  } catch (err) {
    logger.error('PUT /config/process-configs error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/process-configs/:id', adminOnly, async (req, res) => {
  try {
    const old = await configStore.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Kayit bulunamadi' });
    await configStore.remove(req.params.id);
    processConfigCache.invalidate();
    logAudit(req, 'process_config', req.params.id, 'DELETE', old, null);
    res.json({ success: true });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   Süreç Tipleri (Process Types) CRUD
   ═══════════════════════════════════════════ */

router.get('/process-types', async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const opts = { filter: tf(req) };
    if (limit) opts.limit = Number(limit);
    if (offset) opts.offset = Number(offset);
    res.json({ data: await typeStore.readAll(opts) });
  } catch (err) {
    logger.error('GET /config/process-types error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/process-types', adminOnly, validate(CreateProcessTypeSchema), async (req, res) => {
  try {
    const item = await typeStore.create({ ...req.body, tenant_id: req.tenantId });
    processTypeCache.invalidate();
    logAudit(req, 'process_type', item.id, 'CREATE', null, item);
    res.status(201).json({ data: item });
  } catch (err) {
    logger.error('POST /config/process-types error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/process-types/:id', adminOnly, validate(UpdateProcessTypeSchema), async (req, res) => {
  try {
    const old = await typeStore.findById(req.params.id);
    const updated = await typeStore.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
    processTypeCache.invalidate();
    logAudit(req, 'process_type', req.params.id, 'UPDATE', old, updated);
    res.json({ data: updated });
  } catch (err) {
    logger.error('PUT /config/process-types error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/process-types/:id', adminOnly, async (req, res) => {
  try {
    const old = await typeStore.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Kayit bulunamadi' });
    await typeStore.remove(req.params.id);
    processTypeCache.invalidate();
    logAudit(req, 'process_type', req.params.id, 'DELETE', old, null);
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

router.post('/security-profiles', adminOnly, validate(CreateSecurityProfileSchema), async (req, res) => {
  try {
    const item = await securityStore.create({ ...req.body, tenant_id: req.tenantId });
    logAudit(req, 'security_profile', item.id, 'CREATE', null, maskCredentials(item));
    res.status(201).json({ data: maskCredentials(item) });
  } catch (err) {
    logger.error('POST /config/security-profiles error', { error: err.message });
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
   İşlem Adımları (process-steps lookup)
   ═══════════════════════════════════════════ */

router.get('/process-steps', async (req, res) => {
  try {
    const { plant_code, warehouse_code, delivery_type } = req.query;
    if (!plant_code || !warehouse_code || !delivery_type) {
      return res.status(400).json({ error: 'plant_code, warehouse_code, delivery_type zorunlu' });
    }

    const configs = await configStore.readAll({ filter: tf(req) });
    const config = configs.find(c =>
      c.plant_code === plant_code &&
      c.warehouse_code === warehouse_code &&
      c.delivery_type === delivery_type
    );

    if (!config) {
      return res.status(404).json({ error: 'Bu kombinasyon icin uyarlama bulunamadi' });
    }

    const types = await typeStore.readAll({ filter: tf(req) });
    const pType = types.find(t => t.code === config.process_type);
    const templates = pType ? pType.steps : [];

    res.json({
      process_config: {
        plant_code: config.plant_code,
        warehouse_code: config.warehouse_code,
        delivery_type: config.delivery_type,
        delivery_type_desc: config.delivery_type_desc,
        process_type: config.process_type,
        mvt_type: config.mvt_type,
        company_name: config.company_name,
        company_code: config.company_code,
        api_base_url: config.api_base_url,
        bapi_name: config.bapi_name,
        gm_code: config.gm_code
      },
      steps: templates.map(t => ({
        step_no: t.step_no,
        name: t.name,
        source_system: t.source === "3PL" ? config.company_name : t.source,
        target_system: t.target === "3PL" ? config.company_name : t.target,
        direction: t.direction,
        api_endpoint: t.api,
        status: "BEKLIYOR",
        enabled: true,
        company_name: config.company_name,
        company_api_url: config.api_base_url,
        bapi_name: config.bapi_name,
        mvt_type: config.mvt_type,
        gm_code: config.gm_code
      }))
    });
  } catch (err) {
    logger.error('GET /config/process-steps error', { error: err.message });
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   Konfigürasyon Sihirbazı (Configuration Wizard)
   ═══════════════════════════════════════════ */

const { requireRole } = require('../../shared/middleware/auth');
const { getProviders, getTemplateEntities, applyTemplate } = require('./wizardHelper');
const { getClient } = require('../../shared/database/pool');

// GET /config/wizard/providers — list available logistics provider templates
// ?tenant_id=xxx eklenmisse, o tenant icin daha once uygulanan template'leri isaretler
router.get('/wizard/providers', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const data = getProviders();
    const tenantId = req.query.tenant_id;

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
    res.status(500).json({ error: err.message });
  }
});

// GET /config/wizard/preview?provider=ABC_LOG&sub_services=HOROZ,HOROZ_DIST
router.get('/wizard/preview', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { provider, sub_services } = req.query;
    if (!provider) {
      return res.status(400).json({ error: 'provider parametresi zorunlu' });
    }
    const subArr = sub_services ? sub_services.split(',').map(s => s.trim()) : [];
    const result = getTemplateEntities(provider, subArr);
    res.json({ provider, ...result });
  } catch (err) {
    logger.error('GET /config/wizard/preview error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /config/wizard/apply — bulk-create config for a tenant
router.post('/wizard/apply', requireRole('SUPER_ADMIN'), validate(ApplyTemplateSchema), async (req, res) => {
  const { tenant_id, provider_code, sub_services } = req.body;

  const client = await getClient();
  try {
    // Verify tenant exists
    const { rows: tenants } = await client.query('SELECT id, name FROM tenants WHERE id = $1', [tenant_id]);
    if (tenants.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Tenant bulunamadı' });
    }

    // Check existing config count
    const { rows: existCheck } = await client.query(
      'SELECT COUNT(*) as cnt FROM warehouses WHERE tenant_id = $1',
      [tenant_id]
    );
    const hasExisting = Number(existCheck[0].cnt) > 0;

    // Get template entities
    const entities = getTemplateEntities(provider_code, sub_services || []);

    await client.query('BEGIN');
    const result = await applyTemplate(client, tenant_id, entities);
    await client.query('COMMIT');

    // Invalidate caches
    fieldMappingCache.invalidate();
    processTypeCache.invalidate();
    processConfigCache.invalidate();

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
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// DELETE /config/feature-flags/:key — Flag sil
router.delete('/feature-flags/:key', adminOnly, async (req, res) => {
  try {
    const tenantId = req.body.tenant_id || req.tenantId || (req.user && req.user.tenant_id) || null;
    await featureFlags.removeFlag(req.params.key, tenantId);
    logAudit(req, 'feature_flag', req.params.key, 'DELETE', null, null);
    res.json({ ok: true });
  } catch (err) {
    logger.error('DELETE /config/feature-flags error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
