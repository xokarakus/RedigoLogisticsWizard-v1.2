const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');
const { requireScope } = require('../../shared/middleware/auth');
const logger = require('../../shared/utils/logger');
const { maskCredentials, isMasked, SENSITIVE_KEYS } = require('../../shared/utils/securityUtils');

const adminOnly = requireScope('Admin');

const configStore = new DbStore('process_configs');
const typeStore = new DbStore('process_types');
const warehouseStore = new DbStore('warehouses');
const mappingStore = new DbStore('movement_mappings');
const fieldMappingStore = new DbStore('field_mappings');
const securityStore = new DbStore('security_profiles');
const aliasStore = new DbStore('sap_field_aliases');

/* ═══════════════════════════════════════════
   Depolar (Warehouses) CRUD
   ═══════════════════════════════════════════ */

router.get('/warehouses', async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const opts = {};
    if (limit) opts.limit = Number(limit);
    if (offset) opts.offset = Number(offset);
    res.json({ data: await warehouseStore.readAll(opts) });
  } catch (err) {
    logger.error('GET /config/warehouses error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/warehouses', adminOnly, async (req, res) => {
  try {
    const item = await warehouseStore.create(req.body);
    res.status(201).json({ data: item });
  } catch (err) {
    logger.error('POST /config/warehouses error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/warehouses/:id', adminOnly, async (req, res) => {
  try {
    const updated = await warehouseStore.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
    res.json({ data: updated });
  } catch (err) {
    logger.error('PUT /config/warehouses error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/warehouses/:id', adminOnly, async (req, res) => {
  try {
    const ok = await warehouseStore.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Kayit bulunamadi' });
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
    const opts = {};
    if (limit) opts.limit = Number(limit);
    if (offset) opts.offset = Number(offset);
    res.json({ data: await mappingStore.readAll(opts) });
  } catch (err) {
    logger.error('GET /config/mappings error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/mappings', adminOnly, async (req, res) => {
  try {
    const item = await mappingStore.create(req.body);
    res.status(201).json({ data: item });
  } catch (err) {
    logger.error('POST /config/mappings error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/mappings/:id', adminOnly, async (req, res) => {
  try {
    const updated = await mappingStore.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
    res.json({ data: updated });
  } catch (err) {
    logger.error('PUT /config/mappings error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/mappings/:id', adminOnly, async (req, res) => {
  try {
    const ok = await mappingStore.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Kayit bulunamadi' });
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
    const opts = {};
    if (limit) opts.limit = Number(limit);
    if (offset) opts.offset = Number(offset);
    res.json({ data: await configStore.readAll(opts) });
  } catch (err) {
    logger.error('GET /config/process-configs error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/process-configs', adminOnly, async (req, res) => {
  try {
    const item = await configStore.create(req.body);
    res.status(201).json({ data: item });
  } catch (err) {
    logger.error('POST /config/process-configs error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/process-configs/:id', adminOnly, async (req, res) => {
  try {
    const updated = await configStore.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
    res.json({ data: updated });
  } catch (err) {
    logger.error('PUT /config/process-configs error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/process-configs/:id', adminOnly, async (req, res) => {
  try {
    const ok = await configStore.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Kayit bulunamadi' });
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
    const opts = {};
    if (limit) opts.limit = Number(limit);
    if (offset) opts.offset = Number(offset);
    res.json({ data: await typeStore.readAll(opts) });
  } catch (err) {
    logger.error('GET /config/process-types error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/process-types', adminOnly, async (req, res) => {
  try {
    const item = await typeStore.create(req.body);
    res.status(201).json({ data: item });
  } catch (err) {
    logger.error('POST /config/process-types error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/process-types/:id', adminOnly, async (req, res) => {
  try {
    const updated = await typeStore.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
    res.json({ data: updated });
  } catch (err) {
    logger.error('PUT /config/process-types error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/process-types/:id', adminOnly, async (req, res) => {
  try {
    const ok = await typeStore.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Kayit bulunamadi' });
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
    const opts = {};
    if (company_code) opts.filter = { company_code };
    if (limit) opts.limit = Number(limit);
    if (offset) opts.offset = Number(offset);
    const data = await fieldMappingStore.readAll(opts);
    res.json({ data });
  } catch (err) {
    logger.error('GET /config/field-mappings error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/field-mappings', adminOnly, async (req, res) => {
  try {
    const item = await fieldMappingStore.create(req.body);
    res.status(201).json({ data: item });
  } catch (err) {
    logger.error('POST /config/field-mappings error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/field-mappings/:id', adminOnly, async (req, res) => {
  try {
    const updated = await fieldMappingStore.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
    res.json({ data: updated });
  } catch (err) {
    logger.error('PUT /config/field-mappings error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/field-mappings/:id', adminOnly, async (req, res) => {
  try {
    const ok = await fieldMappingStore.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Kayit bulunamadi' });
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
    const opts = {};
    if (company_code) opts.filter = { company_code };
    if (limit) opts.limit = Number(limit);
    if (offset) opts.offset = Number(offset);
    const data = await securityStore.readAll(opts);
    res.json({ data: data.map(maskCredentials) });
  } catch (err) {
    logger.error('GET /config/security-profiles error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/security-profiles', adminOnly, async (req, res) => {
  try {
    const item = await securityStore.create(req.body);
    res.status(201).json({ data: maskCredentials(item) });
  } catch (err) {
    logger.error('POST /config/security-profiles error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/security-profiles/:id', adminOnly, async (req, res) => {
  try {
    const payload = { ...req.body };

    // Merge: masked ("******") credential → preserve existing DB value
    if (payload.config && typeof payload.config === 'object') {
      const hasMasked = Object.entries(payload.config)
        .some(([k, v]) => SENSITIVE_KEYS.has(k) && isMasked(v));
      if (hasMasked) {
        const existing = await securityStore.findById(req.params.id);
        if (existing && existing.config) {
          const merged = { ...payload.config };
          for (const key of SENSITIVE_KEYS) {
            if (isMasked(merged[key]) && existing.config[key] !== undefined) {
              merged[key] = existing.config[key];
            }
          }
          payload.config = merged;
        }
      }
    }

    const updated = await securityStore.update(req.params.id, payload);
    if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
    res.json({ data: maskCredentials(updated) });
  } catch (err) {
    logger.error('PUT /config/security-profiles error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/security-profiles/:id', adminOnly, async (req, res) => {
  try {
    const ok = await securityStore.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Kayit bulunamadi' });
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

    const configs = await configStore.readAll();
    const config = configs.find(c =>
      c.plant_code === plant_code &&
      c.warehouse_code === warehouse_code &&
      c.delivery_type === delivery_type
    );

    if (!config) {
      return res.status(404).json({ error: 'Bu kombinasyon icin uyarlama bulunamadi' });
    }

    const types = await typeStore.readAll();
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

router.post('/test-dispatch', adminOnly, async (req, res) => {
  const { url, method, headers, securityProfileId, body, responseRules } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'url zorunlu' });
  }
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

module.exports = router;
