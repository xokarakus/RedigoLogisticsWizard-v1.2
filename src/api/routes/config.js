const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');
const { requireScope } = require('../../shared/middleware/auth');

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
  res.json({ data: await warehouseStore.readAll() });
});

router.post('/warehouses', adminOnly, async (req, res) => {
  const item = await warehouseStore.create(req.body);
  res.status(201).json({ data: item });
});

router.put('/warehouses/:id', adminOnly, async (req, res) => {
  const updated = await warehouseStore.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ data: updated });
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
  res.json({ data: await mappingStore.readAll() });
});

router.post('/mappings', adminOnly, async (req, res) => {
  const item = await mappingStore.create(req.body);
  res.status(201).json({ data: item });
});

router.put('/mappings/:id', adminOnly, async (req, res) => {
  const updated = await mappingStore.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ data: updated });
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
  res.json({ data: await configStore.readAll() });
});

router.post('/process-configs', adminOnly, async (req, res) => {
  const item = await configStore.create(req.body);
  res.status(201).json({ data: item });
});

router.put('/process-configs/:id', adminOnly, async (req, res) => {
  const updated = await configStore.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ data: updated });
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
  res.json({ data: await typeStore.readAll() });
});

router.post('/process-types', adminOnly, async (req, res) => {
  const item = await typeStore.create(req.body);
  res.status(201).json({ data: item });
});

router.put('/process-types/:id', adminOnly, async (req, res) => {
  const updated = await typeStore.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ data: updated });
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
  let data = await fieldMappingStore.readAll();
  if (req.query.company_code) {
    data = data.filter(fm => fm.company_code === req.query.company_code);
  }
  res.json({ data });
});

router.post('/field-mappings', adminOnly, async (req, res) => {
  const item = await fieldMappingStore.create(req.body);
  res.status(201).json({ data: item });
});

router.put('/field-mappings/:id', adminOnly, async (req, res) => {
  const updated = await fieldMappingStore.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ data: updated });
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
  let data = await securityStore.readAll();
  if (req.query.company_code) {
    data = data.filter(sp => sp.company_code === req.query.company_code);
  }
  res.json({ data });
});

router.post('/security-profiles', adminOnly, async (req, res) => {
  const item = await securityStore.create(req.body);
  res.status(201).json({ data: item });
});

router.put('/security-profiles/:id', adminOnly, async (req, res) => {
  const updated = await securityStore.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ data: updated });
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
});

/* ═══════════════════════════════════════════
   SAP Alan Alias Sözlüğü
   ═══════════════════════════════════════════ */

router.get('/sap-field-aliases', async (req, res) => {
  res.json({ data: await aliasStore.readAll() });
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
