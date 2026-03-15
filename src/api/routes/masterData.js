const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');
const { requireScope, tenantFilter } = require('../../shared/middleware/auth');
const logger = require('../../shared/utils/logger');
const { logAudit } = require('../../shared/middleware/auditLog');
const { applyFieldRules } = require('../../shared/utils/fieldTransformer');
const { dispatch } = require('../../shared/utils/httpDispatcher');

const adminOnly = requireScope('Admin');
const { validate } = require('../../shared/validators/middleware');
const {
  MaterialListQuery, CreateMaterialSchema, UpdateMaterialSchema,
  PartnerListQuery, CreatePartnerSchema, UpdatePartnerSchema,
  DispatchSchema
} = require('../../shared/validators/masterData.schemas');

const materialStore = new DbStore('materials');
const partnerStore = new DbStore('business_partners');
const mappingStore = new DbStore('field_mappings');
const transactionStore = new DbStore('transaction_logs');

function tf(req) { return tenantFilter(req); }

/* ═══════════════════════════════════════════
   Malzeme Kodları (Materials)
   ═══════════════════════════════════════════ */

router.get('/materials', validate(MaterialListQuery, 'query'), async (req, res) => {
  try {
    const { limit = 100, offset, search } = req.query;
    const opts = { filter: tf(req), limit: Number(limit) };
    if (offset) opts.offset = Number(offset);
    let data = await materialStore.readAll(opts);

    if (search) {
      const q = search.toLowerCase();
      data = data.filter(m =>
        (m.sap_material_no || '').toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q) ||
        (m.material_group || '').toLowerCase().includes(q)
      );
    }

    data.sort((a, b) => (a.sap_material_no || '').localeCompare(b.sap_material_no || ''));
    res.json({ data, count: data.length });
  } catch (err) {
    logger.error('GET /master-data/materials error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.get('/materials/:id', async (req, res) => {
  try {
    const item = await materialStore.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Kayit bulunamadi' });
    res.json({ data: item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/materials', adminOnly, validate(CreateMaterialSchema), async (req, res) => {
  try {
    const item = await materialStore.create({ ...req.body, tenant_id: req.tenantId });
    logAudit(req, 'material', item.id, 'CREATE', null, item);
    res.status(201).json({ data: item });
  } catch (err) {
    logger.error('POST /master-data/materials error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/materials/:id', adminOnly, validate(UpdateMaterialSchema), async (req, res) => {
  try {
    const old = await materialStore.findById(req.params.id);
    const updated = await materialStore.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
    logAudit(req, 'material', req.params.id, 'UPDATE', old, updated);
    res.json({ data: updated });
  } catch (err) {
    logger.error('PUT /master-data/materials error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/materials/:id', adminOnly, async (req, res) => {
  try {
    const old = await materialStore.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Kayit bulunamadi' });
    await materialStore.remove(req.params.id);
    logAudit(req, 'material', req.params.id, 'DELETE', old, null);
    res.json({ success: true });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   Müşteri/Satıcı (Business Partners)
   ═══════════════════════════════════════════ */

router.get('/partners', validate(PartnerListQuery, 'query'), async (req, res) => {
  try {
    const { limit = 100, offset, search, type } = req.query;
    const opts = { filter: tf(req), limit: Number(limit) };
    if (offset) opts.offset = Number(offset);
    let data = await partnerStore.readAll(opts);

    if (type && type !== 'ALL') {
      data = data.filter(p => p.partner_type === type);
    }
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(p =>
        (p.sap_partner_no || '').toLowerCase().includes(q) ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.city || '').toLowerCase().includes(q)
      );
    }

    data.sort((a, b) => (a.sap_partner_no || '').localeCompare(b.sap_partner_no || ''));
    res.json({ data, count: data.length });
  } catch (err) {
    logger.error('GET /master-data/partners error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.get('/partners/:id', async (req, res) => {
  try {
    const item = await partnerStore.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Kayit bulunamadi' });
    res.json({ data: item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/partners', adminOnly, validate(CreatePartnerSchema), async (req, res) => {
  try {
    const item = await partnerStore.create({ ...req.body, tenant_id: req.tenantId });
    logAudit(req, 'business_partner', item.id, 'CREATE', null, item);
    res.status(201).json({ data: item });
  } catch (err) {
    logger.error('POST /master-data/partners error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/partners/:id', adminOnly, validate(UpdatePartnerSchema), async (req, res) => {
  try {
    const old = await partnerStore.findById(req.params.id);
    const updated = await partnerStore.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Kayit bulunamadi' });
    logAudit(req, 'business_partner', req.params.id, 'UPDATE', old, updated);
    res.json({ data: updated });
  } catch (err) {
    logger.error('PUT /master-data/partners error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/partners/:id', adminOnly, async (req, res) => {
  try {
    const old = await partnerStore.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Kayit bulunamadi' });
    await partnerStore.remove(req.params.id);
    logAudit(req, 'business_partner', req.params.id, 'DELETE', old, null);
    res.json({ success: true });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   Master Data Dispatch (3PL'e Gönder)
   ═══════════════════════════════════════════ */

router.get('/mappings', async (req, res) => {
  try {
    const all = await mappingStore.readAll({ filter: tf(req) });
    const data = all.filter(m => m.category === 'MASTER_DATA' && m.is_active !== false);
    res.json({ data });
  } catch (err) {
    logger.error('GET /master-data/mappings error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/dispatch', adminOnly, validate(DispatchSchema), async (req, res) => {
  try {
    const { type, ids, mapping_id } = req.body;

    // Mapping profili çek
    const mapping = await mappingStore.findById(mapping_id);
    if (!mapping) return res.status(404).json({ error: 'Eşleştirme profili bulunamadı' });
    if (mapping.category !== 'MASTER_DATA') {
      return res.status(400).json({ error: 'Bu profil MASTER_DATA kategorisinde değil' });
    }

    // Kayıtları çek
    const store = type === 'materials' ? materialStore : partnerStore;
    let records;
    if (ids && ids.length > 0) {
      const promises = ids.map(id => store.findById(id));
      records = (await Promise.all(promises)).filter(Boolean);
    } else {
      records = await store.readAll({ filter: tf(req), limit: 500 });
    }

    if (records.length === 0) {
      return res.status(400).json({ error: 'Gönderilecek kayıt bulunamadı' });
    }

    const fieldRules = mapping.field_rules || [];
    const results = [];
    const correlationId = 'MD-' + Date.now();

    for (const record of records) {
      // Kayıt → SAP-benzeri flat object
      let flatData;
      if (type === 'materials') {
        flatData = {
          MATNR: record.sap_material_no,
          MAKTX: record.description,
          MATKL: record.material_group,
          MEINS: record.base_uom,
          BRGEW: record.gross_weight,
          NTGEW: record.net_weight,
          GEWEI: record.weight_unit
        };
      } else {
        flatData = {
          KUNNR: record.partner_type === 'CUSTOMER' ? record.sap_partner_no : '',
          LIFNR: record.partner_type === 'VENDOR' ? record.sap_partner_no : '',
          NAME1: record.name,
          ORT01: record.city,
          LAND1: record.country,
          PTYPE: record.partner_type
        };
      }

      // Field rules uygula
      let transformed;
      try {
        transformed = fieldRules.length > 0
          ? applyFieldRules(flatData, fieldRules)
          : flatData;
      } catch (e) {
        results.push({
          id: record.id,
          sap_no: record.sap_material_no || record.sap_partner_no,
          status: 'FAILED',
          error: 'Transform hatası: ' + e.message
        });
        continue;
      }

      // Dispatch
      if (!mapping.api_endpoint) {
        results.push({
          id: record.id,
          sap_no: record.sap_material_no || record.sap_partner_no,
          status: 'FAILED',
          error: 'API endpoint tanımlı değil'
        });
        continue;
      }

      const startedAt = new Date().toISOString();
      try {
        const dispatchResult = await dispatch({
          url: mapping.api_endpoint,
          method: mapping.http_method || 'POST',
          headers: mapping.headers || [],
          securityProfileId: mapping.security_profile_id,
          body: transformed,
          timeout_ms: mapping.timeout_ms
        });

        // Transaction log
        await transactionStore.create({
          correlation_id: correlationId,
          direction: 'OUTBOUND',
          action: 'MASTER_DATA_SYNC',
          status: dispatchResult.ok ? 'SUCCESS' : 'FAILED',
          sap_function: mapping.api_endpoint,
          sap_doc_number: record.sap_material_no || record.sap_partner_no,
          sap_request: transformed,
          sap_response: dispatchResult.responseBody,
          error_message: dispatchResult.error,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          duration_ms: dispatchResult.duration_ms,
          tenant_id: req.tenantId
        });

        results.push({
          id: record.id,
          sap_no: record.sap_material_no || record.sap_partner_no,
          status: dispatchResult.ok ? 'SUCCESS' : 'FAILED',
          error: dispatchResult.error || null,
          duration_ms: dispatchResult.duration_ms
        });

        // Başarılıysa last_synced_at güncelle
        if (dispatchResult.ok) {
          await store.update(record.id, { last_synced_at: new Date().toISOString() });
        }
      } catch (e) {
        results.push({
          id: record.id,
          sap_no: record.sap_material_no || record.sap_partner_no,
          status: 'FAILED',
          error: e.message
        });
      }
    }

    const successCount = results.filter(r => r.status === 'SUCCESS').length;
    logAudit(req, 'master_data_dispatch', null, 'DISPATCH', null, {
      type, mapping_id, total: records.length, success: successCount
    });

    res.json({
      dispatched: records.length,
      success: successCount,
      failed: records.length - successCount,
      results
    });
  } catch (err) {
    logger.error('POST /master-data/dispatch error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
