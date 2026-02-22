const express = require('express');
const router = express.Router();
const JsonStore = require('../../shared/jsonStore');

const configStore = new JsonStore('process_configs.json');
const typeStore = new JsonStore('process_types.json');
const warehouseStore = new JsonStore('warehouses.json');
const mappingStore = new JsonStore('movement_mappings.json');
const fieldMappingStore = new JsonStore('field_mappings.json');
const securityStore = new JsonStore('security_profiles.json');

/* ═══════════════════════════════════════════
   Depolar (Warehouses) CRUD
   ═══════════════════════════════════════════ */

router.get('/warehouses', (req, res) => {
  res.json({ data: warehouseStore.readAll() });
});

router.post('/warehouses', (req, res) => {
  const item = warehouseStore.create(req.body);
  res.status(201).json({ data: item });
});

router.put('/warehouses/:id', (req, res) => {
  const updated = warehouseStore.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ data: updated });
});

router.delete('/warehouses/:id', (req, res) => {
  const ok = warehouseStore.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ success: true });
});

/* ═══════════════════════════════════════════
   Hareket Eslemeleri (Mappings) CRUD
   ═══════════════════════════════════════════ */

router.get('/mappings', (req, res) => {
  res.json({ data: mappingStore.readAll() });
});

router.post('/mappings', (req, res) => {
  const item = mappingStore.create(req.body);
  res.status(201).json({ data: item });
});

router.put('/mappings/:id', (req, res) => {
  const updated = mappingStore.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ data: updated });
});

router.delete('/mappings/:id', (req, res) => {
  const ok = mappingStore.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ success: true });
});

/* ═══════════════════════════════════════════
   Süreç Uyarlamaları (Process Configs) CRUD
   ═══════════════════════════════════════════ */

router.get('/process-configs', (req, res) => {
  res.json({ data: configStore.readAll() });
});

router.post('/process-configs', (req, res) => {
  const item = configStore.create(req.body);
  res.status(201).json({ data: item });
});

router.put('/process-configs/:id', (req, res) => {
  const updated = configStore.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ data: updated });
});

router.delete('/process-configs/:id', (req, res) => {
  const ok = configStore.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ success: true });
});

/* ═══════════════════════════════════════════
   Süreç Tipleri (Process Types) CRUD
   ═══════════════════════════════════════════ */

router.get('/process-types', (req, res) => {
  res.json({ data: typeStore.readAll() });
});

router.post('/process-types', (req, res) => {
  const item = typeStore.create(req.body);
  res.status(201).json({ data: item });
});

router.put('/process-types/:id', (req, res) => {
  const updated = typeStore.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ data: updated });
});

router.delete('/process-types/:id', (req, res) => {
  const ok = typeStore.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ success: true });
});

/* ═══════════════════════════════════════════
   Alan Eşleştirmeleri (Field Mappings) CRUD
   ═══════════════════════════════════════════ */

router.get('/field-mappings', (req, res) => {
  let data = fieldMappingStore.readAll();
  if (req.query.company_code) {
    data = data.filter(fm => fm.company_code === req.query.company_code);
  }
  res.json({ data });
});

router.post('/field-mappings', (req, res) => {
  const item = fieldMappingStore.create(req.body);
  res.status(201).json({ data: item });
});

router.put('/field-mappings/:id', (req, res) => {
  const updated = fieldMappingStore.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ data: updated });
});

router.delete('/field-mappings/:id', (req, res) => {
  const ok = fieldMappingStore.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ success: true });
});

/* ═══════════════════════════════════════════
   Güvenlik Profilleri (Security Profiles) CRUD
   ═══════════════════════════════════════════ */

router.get('/security-profiles', (req, res) => {
  let data = securityStore.readAll();
  if (req.query.company_code) {
    data = data.filter(sp => sp.company_code === req.query.company_code);
  }
  res.json({ data });
});

router.post('/security-profiles', (req, res) => {
  const item = securityStore.create(req.body);
  res.status(201).json({ data: item });
});

router.put('/security-profiles/:id', (req, res) => {
  const updated = securityStore.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ data: updated });
});

router.delete('/security-profiles/:id', (req, res) => {
  const ok = securityStore.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Kayit bulunamadi' });
  res.json({ success: true });
});

/* ═══════════════════════════════════════════
   İşlem Adımları (process-steps lookup)
   ═══════════════════════════════════════════ */

router.get('/process-steps', (req, res) => {
  const { plant_code, warehouse_code, delivery_type } = req.query;
  if (!plant_code || !warehouse_code || !delivery_type) {
    return res.status(400).json({ error: 'plant_code, warehouse_code, delivery_type zorunlu' });
  }

  const configs = configStore.readAll();
  const config = configs.find(c =>
    c.plant_code === plant_code &&
    c.warehouse_code === warehouse_code &&
    c.delivery_type === delivery_type
  );

  if (!config) {
    return res.status(404).json({ error: 'Bu kombinasyon icin uyarlama bulunamadi' });
  }

  const types = typeStore.readAll();
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

module.exports = router;
