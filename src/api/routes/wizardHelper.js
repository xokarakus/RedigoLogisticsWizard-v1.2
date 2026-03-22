/**
 * Configuration Wizard Helper
 *
 * Provider template'leri önce DB'den (provider_templates tablosu), yoksa
 * src/data/ JSON dosyalarından okur.
 *
 * EXCLUDED from templates: security_profiles, system_settings (email), users
 */

const fs = require('fs');
const path = require('path');
const logger = require('../../shared/utils/logger');
const DbStore = require('../../shared/database/dbStore');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// HOROZ family codes grouped under one parent
const HOROZ_SUB_CODES = ['HOROZ', 'HOROZ_DIST', 'HOROZ_TRACK', 'HOROZ_ECOM', 'HOROZ_EXPORT_WH', 'HOROZ_EXPORT'];

const HOROZ_SUB_NAMES = {
  HOROZ: 'Depo (Sipari\u015f G\u00f6nderim + Mal Giri\u015f)',
  HOROZ_DIST: 'Yurti\u00e7i Da\u011f\u0131t\u0131m',
  HOROZ_TRACK: 'Kargo Takip',
  HOROZ_ECOM: 'E-Ticaret Depo',
  HOROZ_EXPORT_WH: 'E-\u0130hracat Depo',
  HOROZ_EXPORT: 'E-\u0130hracat Da\u011f\u0131t\u0131m'
};

// JSONB columns that need JSON.stringify before INSERT
const JSONB_COLUMNS = new Set([
  'steps', 'config', 'headers', 'sap_sample_json', 'threepl_sample_json',
  'threepl_response_sample_json', 'field_rules', 'response_rules'
]);

// UUID v4 format check
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Table column cache
const _colCache = {};

const templateStore = new DbStore('provider_templates');

function loadSeedFile(filename) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (err) {
    logger.error('Seed file read error', { filename, error: err.message });
    return [];
  }
}

/**
 * List available logistics providers.
 * Önce DB'deki provider_templates, sonra JSON seed fallback.
 * DB ve JSON'dan gelenler birleştirilir (DB öncelikli).
 */
async function getProviders() {
  const result = [];
  const seenCodes = new Set();

  // ── 1. DB template'leri ──
  try {
    const dbTemplates = await templateStore.readAll();
    for (const t of dbTemplates) {
      if (!t.is_active) continue;
      seenCodes.add(t.code);
      const td = t.template_data || {};
      result.push({
        id: t.id,
        code: t.code,
        name: t.name,
        description: t.description,
        auth_type: t.auth_type || '',
        sub_services: t.sub_services || null,
        source: 'db',
        counts: {
          warehouses: (td.warehouses || []).length,
          field_mappings: (td.field_mappings || []).length
        }
      });
    }
  } catch (err) {
    // provider_templates tablosu henüz yoksa sessizce devam et
    logger.debug('DB provider_templates not available, using JSON fallback', { error: err.message });
  }

  // ── 2. JSON seed fallback ──
  const jsonProviders = getProvidersFromJson();
  for (const jp of jsonProviders) {
    if (!seenCodes.has(jp.code)) {
      result.push({ ...jp, source: 'json' });
    }
  }

  return result;
}

/**
 * JSON seed dosyalarından provider listesi (eski mantık).
 */
function getProvidersFromJson() {
  const warehouses = loadSeedFile('warehouses.json');
  const fieldMappings = loadSeedFile('field_mappings.json');
  const securityProfiles = loadSeedFile('security_profiles.json');

  const providerMap = {};
  for (const w of warehouses) {
    const code = w.company_code;
    if (!code || code === 'REDIGO') continue;
    if (!providerMap[code]) {
      providerMap[code] = { code, name: w.company_name || w.name };
    }
  }

  const authTypes = {};
  for (const sp of securityProfiles) {
    if (sp.company_code && !authTypes[sp.company_code]) {
      authTypes[sp.company_code] = sp.auth_type;
    }
  }

  const whCodes = {};
  for (const w of warehouses) {
    if (!w.company_code || w.company_code === 'REDIGO') continue;
    whCodes[w.company_code] = (whCodes[w.company_code] || 0) + 1;
  }

  const fmCounts = {};
  for (const fm of fieldMappings) {
    if (!fm.company_code || fm.company_code === 'REDIGO') continue;
    fmCounts[fm.company_code] = (fmCounts[fm.company_code] || 0) + 1;
  }

  const result = [];
  const horozAdded = { done: false };

  for (const code of Object.keys(providerMap).sort()) {
    if (HOROZ_SUB_CODES.includes(code)) {
      if (!horozAdded.done) {
        horozAdded.done = true;
        let totalWh = 0, totalFm = 0;
        for (const sc of HOROZ_SUB_CODES) {
          totalWh += whCodes[sc] || 0;
          totalFm += fmCounts[sc] || 0;
        }
        result.push({
          code: 'HOROZ',
          name: 'Horoz Lojistik',
          auth_type: authTypes['HOROZ'] || 'PROCESS_KEY',
          sub_services: HOROZ_SUB_CODES.map(sc => ({
            code: sc,
            name: HOROZ_SUB_NAMES[sc] || sc
          })),
          counts: {
            warehouses: totalWh,
            field_mappings: totalFm
          }
        });
      }
      continue;
    }

    result.push({
      code,
      name: providerMap[code].name,
      auth_type: authTypes[code] || '',
      sub_services: null,
      counts: {
        warehouses: whCodes[code] || 0,
        field_mappings: fmCounts[code] || 0
      }
    });
  }

  return result;
}

/**
 * Get template entities for a given provider.
 * Önce DB'de ara, yoksa JSON seed'den oku.
 */
async function getTemplateEntities(providerCode, subServices) {
  // ── 1. DB'den dene ──
  try {
    const dbTemplates = await templateStore.readAll();
    const dbTemplate = dbTemplates.find(t => t.code === providerCode && t.is_active);
    if (dbTemplate && dbTemplate.template_data) {
      const td = dbTemplate.template_data;
      const strip = arr => (arr || []).map(item => {
        const copy = { ...item };
        delete copy.id;
        return copy;
      });
      return {
        warehouses: strip(td.warehouses),
        field_mappings: strip(td.field_mappings),
        counts: {
          warehouses: (td.warehouses || []).length,
          field_mappings: (td.field_mappings || []).length
        }
      };
    }
  } catch (err) {
    logger.debug('DB template lookup failed, using JSON fallback', { providerCode, error: err.message });
  }

  // ── 2. JSON fallback ──
  return getTemplateEntitiesFromJson(providerCode, subServices);
}

/**
 * JSON seed dosyalarından template entity'leri (eski mantık).
 */
function getTemplateEntitiesFromJson(providerCode, subServices) {
  let companyCodes;
  if (providerCode === 'HOROZ') {
    companyCodes = (subServices && subServices.length > 0) ? subServices : HOROZ_SUB_CODES;
    companyCodes = companyCodes.filter(c => HOROZ_SUB_CODES.includes(c));
  } else {
    companyCodes = [providerCode];
  }

  const codeSet = new Set(companyCodes);

  const allWarehouses = loadSeedFile('warehouses.json');
  const allFieldMappings = loadSeedFile('field_mappings.json');

  const warehouses = allWarehouses.filter(w => codeSet.has(w.company_code));
  const fieldMappings = allFieldMappings.filter(fm => codeSet.has(fm.company_code));

  const strip = arr => arr.map(item => {
    const copy = { ...item };
    delete copy.id;
    return copy;
  });

  return {
    warehouses: strip(warehouses),
    field_mappings: strip(fieldMappings),
    counts: {
      warehouses: warehouses.length,
      field_mappings: fieldMappings.length
    }
  };
}

/**
 * Tenant'ın mevcut config'ini template_data formatında export et.
 */
async function exportTenantConfig(tenantId) {
  const whStore = new DbStore('warehouses');
  const fmStore = new DbStore('field_mappings');

  const [warehouses, fieldMappings] = await Promise.all([
    whStore.readAll({ filter: { tenant_id: tenantId } }),
    fmStore.readAll({ filter: { tenant_id: tenantId } })
  ]);

  // ID ve tenant_id'leri strip et (template olarak kullanılacak)
  const strip = arr => arr.map(item => {
    const copy = { ...item };
    delete copy.id;
    delete copy.tenant_id;
    delete copy.created_at;
    delete copy.updated_at;
    return copy;
  });

  return {
    warehouses: strip(warehouses),
    field_mappings: strip(fieldMappings)
  };
}

/**
 * Insert a single row into a table using a dedicated client.
 */
async function insertRow(client, table, row) {
  if (!_colCache[table]) {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
      [table]
    );
    _colCache[table] = new Set(rows.map(r => r.column_name));
  }
  const tableCols = _colCache[table];

  const data = { ...row };
  if (data.id && !UUID_RE.test(data.id)) {
    delete data.id;
  }

  const keys = Object.keys(data).filter(k => tableCols.has(k));
  if (keys.length === 0) return null;

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

  const result = await client.query(
    `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) RETURNING id`,
    values
  );
  return result.rows[0];
}

/**
 * Apply template entities to a tenant within a transaction.
 */
async function applyTemplate(client, tenantId, entities) {
  const counts = { warehouses: 0, field_mappings: 0 };

  const tables = [
    { key: 'warehouses', table: 'warehouses' },
    { key: 'field_mappings', table: 'field_mappings' }
  ];

  for (const { key, table } of tables) {
    const rows = entities[key] || [];
    for (let i = 0; i < rows.length; i++) {
      const sp = `sp_${table}_${i}`;
      try {
        await client.query(`SAVEPOINT ${sp}`);
        const inserted = await insertRow(client, table, { ...rows[i], tenant_id: tenantId });
        if (inserted) counts[key]++;
        await client.query(`RELEASE SAVEPOINT ${sp}`);
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        if (err.code === '23505') {
          logger.debug(`Wizard skip duplicate in ${table}`, { error: err.detail });
        } else {
          logger.warn(`Wizard insert error in ${table}`, { error: err.message });
        }
      }
    }
  }

  return { counts };
}

module.exports = {
  getProviders,
  getTemplateEntities,
  applyTemplate,
  exportTenantConfig,
  templateStore,
  HOROZ_SUB_CODES
};
