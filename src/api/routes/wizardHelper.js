/**
 * Configuration Wizard Helper
 *
 * Reads seed JSON files from src/data/ and provides provider listing,
 * template preview, and bulk-insert logic for tenant configuration wizard.
 *
 * EXCLUDED from templates: security_profiles, system_settings (email), users
 */

const fs = require('fs');
const path = require('path');
const logger = require('../../shared/utils/logger');

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
 * List available logistics providers from seed data.
 * Groups HOROZ sub-variants under a single parent.
 */
function getProviders() {
  const processConfigs = loadSeedFile('process_configs.json');
  const warehouses = loadSeedFile('warehouses.json');
  const fieldMappings = loadSeedFile('field_mappings.json');
  const movementMappings = loadSeedFile('movement_mappings.json');
  const securityProfiles = loadSeedFile('security_profiles.json');

  // Extract distinct providers from process_configs
  const providerMap = {};
  for (const pc of processConfigs) {
    const code = pc.company_code;
    if (!code || code === 'REDIGO') continue;
    if (!providerMap[code]) {
      providerMap[code] = { code, name: pc.company_name, api_base_url: pc.api_base_url };
    }
  }

  // Get auth_type per provider from security_profiles (display only)
  const authTypes = {};
  for (const sp of securityProfiles) {
    if (sp.company_code && !authTypes[sp.company_code]) {
      authTypes[sp.company_code] = sp.auth_type;
    }
  }

  // Count entities per company_code
  const whCodes = {};
  for (const w of warehouses) {
    if (!w.company_code || w.company_code === 'REDIGO') continue;
    whCodes[w.company_code] = (whCodes[w.company_code] || 0) + 1;
  }

  const pcCounts = {};
  for (const pc of processConfigs) {
    if (!pc.company_code || pc.company_code === 'REDIGO') continue;
    pcCounts[pc.company_code] = (pcCounts[pc.company_code] || 0) + 1;
  }

  const fmCounts = {};
  for (const fm of fieldMappings) {
    if (!fm.company_code || fm.company_code === 'REDIGO') continue;
    fmCounts[fm.company_code] = (fmCounts[fm.company_code] || 0) + 1;
  }

  // Movement mappings are by warehouse_code, map warehouse_code → company_code
  const whToCompany = {};
  for (const w of warehouses) {
    if (w.code && w.company_code) whToCompany[w.code] = w.company_code;
  }
  const mmCounts = {};
  for (const mm of movementMappings) {
    const cc = whToCompany[mm.warehouse_code];
    if (cc && cc !== 'REDIGO') {
      mmCounts[cc] = (mmCounts[cc] || 0) + 1;
    }
  }

  // Build result, grouping HOROZ under single parent
  const result = [];
  const horozAdded = { done: false };

  for (const code of Object.keys(providerMap).sort()) {
    if (HOROZ_SUB_CODES.includes(code)) {
      if (!horozAdded.done) {
        horozAdded.done = true;
        // Aggregate HOROZ counts
        let totalWh = 0, totalPc = 0, totalFm = 0, totalMm = 0;
        for (const sc of HOROZ_SUB_CODES) {
          totalWh += whCodes[sc] || 0;
          totalPc += pcCounts[sc] || 0;
          totalFm += fmCounts[sc] || 0;
          totalMm += mmCounts[sc] || 0;
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
            process_configs: totalPc,
            field_mappings: totalFm,
            movement_mappings: totalMm
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
        process_configs: pcCounts[code] || 0,
        field_mappings: fmCounts[code] || 0,
        movement_mappings: mmCounts[code] || 0
      }
    });
  }

  return result;
}

/**
 * Get template entities for a given provider.
 * @param {string} providerCode - e.g. 'ABC_LOG', 'HOROZ'
 * @param {string[]} [subServices] - for HOROZ: which sub-service codes to include
 * @returns {{ warehouses, process_types, process_configs, field_mappings, movement_mappings, counts }}
 */
function getTemplateEntities(providerCode, subServices) {
  // Determine which company_codes to filter by
  let companyCodes;
  if (providerCode === 'HOROZ') {
    companyCodes = (subServices && subServices.length > 0) ? subServices : HOROZ_SUB_CODES;
    // Ensure only valid HOROZ codes
    companyCodes = companyCodes.filter(c => HOROZ_SUB_CODES.includes(c));
  } else {
    companyCodes = [providerCode];
  }

  const codeSet = new Set(companyCodes);

  // Load seed files
  const allWarehouses = loadSeedFile('warehouses.json');
  const allProcessTypes = loadSeedFile('process_types.json');
  const allProcessConfigs = loadSeedFile('process_configs.json');
  const allFieldMappings = loadSeedFile('field_mappings.json');
  const allMovementMappings = loadSeedFile('movement_mappings.json');

  // Filter by company_code
  const warehouses = allWarehouses.filter(w => codeSet.has(w.company_code));
  const processConfigs = allProcessConfigs.filter(pc => codeSet.has(pc.company_code));
  const fieldMappings = allFieldMappings.filter(fm => codeSet.has(fm.company_code));

  // Process types are universal (not company-specific) — include all
  const processTypes = allProcessTypes;

  // Movement mappings: filter by the warehouse codes we're including
  const whCodeSet = new Set(warehouses.map(w => w.code));
  const movementMappings = allMovementMappings.filter(mm => whCodeSet.has(mm.warehouse_code));

  // Strip IDs (DB will generate new UUIDs)
  const strip = arr => arr.map(item => {
    const copy = { ...item };
    delete copy.id;
    return copy;
  });

  return {
    warehouses: strip(warehouses),
    process_types: strip(processTypes),
    process_configs: strip(processConfigs),
    field_mappings: strip(fieldMappings),
    movement_mappings: strip(movementMappings),
    counts: {
      warehouses: warehouses.length,
      process_types: processTypes.length,
      process_configs: processConfigs.length,
      field_mappings: fieldMappings.length,
      movement_mappings: movementMappings.length
    }
  };
}

/**
 * Insert a single row into a table using a dedicated client.
 * Reuses seed.js logic: strips non-UUID IDs, serializes JSONB, skips unknown columns.
 */
async function insertRow(client, table, row) {
  // Get table columns (cached)
  if (!_colCache[table]) {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
      [table]
    );
    _colCache[table] = new Set(rows.map(r => r.column_name));
  }
  const tableCols = _colCache[table];

  const data = { ...row };
  // Strip non-UUID IDs
  if (data.id && !UUID_RE.test(data.id)) {
    delete data.id;
  }

  // Only keep columns that exist in the table
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
 * @param {object} client - dedicated pg client (from pool.connect())
 * @param {string} tenantId
 * @param {object} entities - from getTemplateEntities()
 * @returns {{ counts }} - per-table insert counts
 */
async function applyTemplate(client, tenantId, entities) {
  const counts = { process_types: 0, warehouses: 0, process_configs: 0, field_mappings: 0, movement_mappings: 0 };

  const tables = [
    { key: 'process_types', table: 'process_types' },
    { key: 'warehouses', table: 'warehouses' },
    { key: 'process_configs', table: 'process_configs' },
    { key: 'field_mappings', table: 'field_mappings' },
    { key: 'movement_mappings', table: 'movement_mappings' }
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
  HOROZ_SUB_CODES
};
