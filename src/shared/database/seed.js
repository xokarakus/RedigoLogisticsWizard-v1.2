#!/usr/bin/env node
/**
 * Seed Script — JSON dosyalarından PostgreSQL'e veri aktarımı
 *
 * Mevcut JSON data dosyalarını okur ve PostgreSQL tablolarına INSERT eder.
 * Eski string ID'ler (id_xxx) dönüştürülür — PostgreSQL UUID üretir.
 * Önceden var olan verileri temizler (TRUNCATE) ve yeniden ekler.
 *
 * Kullanım: npm run seed
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function readJson(filename) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

const JSONB_COLUMNS = new Set([
  'steps', 'config', 'headers', 'sap_sample_json', 'threepl_sample_json',
  'threepl_response_sample_json', 'field_rules', 'response_rules',
  'sap_raw_payload', 'wms_raw_payload', 'sap_request', 'sap_response',
  'edited_payload', 'unit_conversions', 'kit_components', 'wms_serial_numbers',
  'wms_hu_ids', 'discrepancies', 'aliases', 'lines'
]);

// Tablo kolon isimlerini cache'le
const tableColumnsCache = {};
async function getTableColumns(client, table) {
  if (tableColumnsCache[table]) return tableColumnsCache[table];
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
    [table]
  );
  const cols = new Set(rows.map(r => r.column_name));
  tableColumnsCache[table] = cols;
  return cols;
}

// UUID v4 formatı kontrolü
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tek bir kaydı tabloya ekle.
 * - id geçerli UUID ise korunur (sabit referanslar için)
 * - id eski format (sp_1, id_xxx) ise çıkarılır → PostgreSQL UUID üretir
 * Tabloda olmayan kolonları otomatik atlar.
 */
async function insertRow(client, table, row) {
  const tableCols = await getTableColumns(client, table);
  const data = { ...row };
  // UUID formatında değilse sil (PostgreSQL gen_random_uuid() üretecek)
  if (data.id && !UUID_RE.test(data.id)) {
    delete data.id;
  }

  // Tabloda olmayan alanları çıkar
  const keys = Object.keys(data).filter(k => tableCols.has(k));
  if (keys.length === 0) return;

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

  await client.query(
    `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`,
    values
  );
}

async function seedTable(client, table, jsonFile) {
  const data = readJson(jsonFile);
  if (!data || !Array.isArray(data) || data.length === 0) {
    console.log('  - ' + table + ' ← ' + jsonFile + ' (boş veya yok, atlanıyor)');
    return 0;
  }

  // Truncate with CASCADE to handle FK constraints
  await client.query(`TRUNCATE "${table}" CASCADE`);

  let count = 0;
  for (const row of data) {
    try {
      await insertRow(client, table, row);
      count++;
    } catch (err) {
      console.error('  ! ' + table + ' insert hatası:', err.message);
      console.error('    Kayıt:', JSON.stringify(row).substring(0, 200));
    }
  }

  console.log('  ✓ ' + table + ' ← ' + count + ' kayıt');
  return count;
}

async function seedAliases(client) {
  const data = readJson('sap_field_aliases.json');
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    console.log('  - sap_field_aliases ← sap_field_aliases.json (boş veya yok, atlanıyor)');
    return;
  }

  await client.query(
    'UPDATE sap_field_aliases SET aliases = $1::jsonb WHERE id = 1',
    [JSON.stringify(data)]
  );
  console.log('  ✓ sap_field_aliases ← ' + Object.keys(data).length + ' alan');
}

async function seed() {
  console.log('Seed başlatılıyor...\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Config tabloları (bağımlılık sırası önemli)
    await seedTable(client, 'warehouses', 'warehouses.json');
    await seedTable(client, 'process_types', 'process_types.json');
    await seedTable(client, 'process_configs', 'process_configs.json');
    await seedTable(client, 'movement_mappings', 'movement_mappings.json');
    await seedTable(client, 'security_profiles', 'security_profiles.json');
    await seedTable(client, 'field_mappings', 'field_mappings.json');

    // İşlem verileri
    await seedTable(client, 'work_orders', 'work_orders.json');
    await seedTable(client, 'transaction_logs', 'transactions.json');
    await seedTable(client, 'reconciliation_reports', 'reconciliation.json');

    // Referans sözlüğü
    await seedAliases(client);

    await client.query('COMMIT');
    console.log('\nSeed tamamlandı.\n');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nSeed hatası:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

seed();
