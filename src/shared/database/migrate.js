#!/usr/bin/env node
/**
 * Migration Runner
 * migrations/ dizinindeki SQL dosyalarını sırayla çalıştırır.
 * Uygulanan migration'ları schema_migrations tablosunda takip eder.
 *
 * Kullanım: npm run migrate
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         SERIAL PRIMARY KEY,
      filename   VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations() {
  const { rows } = await pool.query(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  return new Set(rows.map(r => r.filename));
}

async function getMigrationFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  return files;
}

async function runMigration(filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1)',
      [filename]
    );
    console.log('  ✓ ' + filename);
  } catch (err) {
    console.error('  ✗ ' + filename + ' — ' + err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function migrate() {
  console.log('Migration başlatılıyor...\n');

  try {
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();
    const files = await getMigrationFiles();

    const pending = files.filter(f => !applied.has(f));

    if (pending.length === 0) {
      console.log('Tüm migration\'lar güncel. Yeni migration yok.\n');
      process.exit(0);
    }

    console.log(pending.length + ' migration uygulanacak:\n');

    for (const file of pending) {
      await runMigration(file);
    }

    console.log('\nMigration tamamlandı.\n');
    process.exit(0);
  } catch (err) {
    console.error('\nMigration hatası:', err.message);
    process.exit(1);
  }
}

migrate();
