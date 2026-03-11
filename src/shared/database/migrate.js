#!/usr/bin/env node
/**
 * Migration Runner
 * migrations/ dizinindeki SQL dosyalarini sirayla calistirir.
 * Uygulanan migration'lari schema_migrations tablosunda takip eder.
 *
 * Kullanim:
 *   npm run migrate            — Bekleyen migration'lari uygula
 *   npm run migrate:status     — Durum tablosu goster
 *   npm run migrate:rollback   — Son migration'i geri al
 *   npm run migrate:rollback 3 — Son 3 migration'i geri al
 *
 * Programmatic (index.js startup):
 *   const { runPending } = require('./migrate');
 *   await runPending();        — Bekleyen migration'lari sessizce uygula
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/* ═══════════════════════════════════════════
   Core Helpers
   ═══════════════════════════════════════════ */

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         SERIAL PRIMARY KEY,
      filename   VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      checksum   VARCHAR(64)
    )
  `);
  // checksum kolonu yoksa ekle (eski tablolar icin)
  await pool.query(`
    ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum VARCHAR(64)
  `);
}

function getMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

async function getAppliedMigrations() {
  const { rows } = await pool.query(
    'SELECT filename, applied_at, checksum FROM schema_migrations ORDER BY filename'
  );
  return rows;
}

/** Basit checksum — icerik degisikligi tespiti icin */
function checksum(content) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(content).digest('hex').substring(0, 16);
}

/** Migration dosyasinin UP ve DOWN bolumlerini ayristir */
function parseMigration(sql) {
  // Format: SQL iceriginde -- DOWN isaretcisi varsa ayir
  const downMarker = /^--\s*DOWN\b/im;
  const match = sql.match(downMarker);
  if (match) {
    const idx = sql.indexOf(match[0]);
    return {
      up: sql.substring(0, idx).trim(),
      down: sql.substring(idx + match[0].length).trim()
    };
  }
  return { up: sql.trim(), down: null };
}

/* ═══════════════════════════════════════════
   Commands
   ═══════════════════════════════════════════ */

/**
 * Bekleyen migration'lari uygula.
 * @param {object} opts
 * @param {boolean} opts.silent — console ciktisini bastir (startup icin)
 * @returns {{ applied: number, total: number }}
 */
async function runPending(opts) {
  const silent = opts && opts.silent;
  function log(msg) { if (!silent) console.log(msg); }

  await ensureMigrationsTable();
  const appliedRows = await getAppliedMigrations();
  const appliedSet = new Set(appliedRows.map(r => r.filename));
  const files = getMigrationFiles();
  const pending = files.filter(f => !appliedSet.has(f));

  if (pending.length === 0) {
    log('Tum migration\'lar guncel. (' + files.length + ' / ' + files.length + ')\n');
    return { applied: 0, total: files.length };
  }

  log(pending.length + ' migration uygulanacak:\n');

  for (const file of pending) {
    const filepath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filepath, 'utf8');
    const { up } = parseMigration(sql);
    const cs = checksum(sql);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(up);
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
        [file, cs]
      );
      await client.query('COMMIT');
      log('  \u2713 ' + file);
    } catch (err) {
      await client.query('ROLLBACK');
      log('  \u2717 ' + file + ' \u2014 ' + err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  log('\nMigration tamamlandi. (' + (appliedSet.size + pending.length) + ' / ' + files.length + ')\n');
  return { applied: pending.length, total: files.length };
}

/**
 * Migration durum tablosu goster.
 */
async function status() {
  await ensureMigrationsTable();
  const appliedRows = await getAppliedMigrations();
  const appliedMap = {};
  appliedRows.forEach(r => { appliedMap[r.filename] = r; });
  const files = getMigrationFiles();

  console.log('\n  Migration Durumu (' + files.length + ' dosya)\n');
  console.log('  ' + '-'.repeat(72));
  console.log('  ' + pad('Dosya', 42) + pad('Durum', 12) + 'Tarih');
  console.log('  ' + '-'.repeat(72));

  let pendingCount = 0;
  for (const f of files) {
    const row = appliedMap[f];
    if (row) {
      const dt = new Date(row.applied_at).toLocaleString('tr-TR');
      console.log('  ' + pad(f, 42) + pad('\u2713 Uygulandi', 12) + dt);
    } else {
      console.log('  ' + pad(f, 42) + '\u2717 Bekliyor');
      pendingCount++;
    }
  }

  console.log('  ' + '-'.repeat(72));
  if (pendingCount > 0) {
    console.log('  ' + pendingCount + ' migration bekliyor. "npm run migrate" ile uygulayabilirsiniz.\n');
  } else {
    console.log('  Tum migration\'lar guncel.\n');
  }

  // Checksum uyumsuzlugu kontrolu
  let driftCount = 0;
  for (const f of files) {
    const row = appliedMap[f];
    if (row && row.checksum) {
      const filepath = path.join(MIGRATIONS_DIR, f);
      const sql = fs.readFileSync(filepath, 'utf8');
      const cs = checksum(sql);
      if (cs !== row.checksum) {
        if (driftCount === 0) console.log('  \u26A0  Checksum uyumsuzluklari:');
        console.log('    ' + f + '  (beklenen: ' + row.checksum + ', mevcut: ' + cs + ')');
        driftCount++;
      }
    }
  }
  if (driftCount > 0) {
    console.log('  ' + driftCount + ' dosya uygulama sonrasi degistirilmis!\n');
  }
}

/**
 * Son N migration'i geri al.
 * @param {number} count — kac migration geri alinacak (default 1)
 */
async function rollback(count) {
  count = count || 1;
  await ensureMigrationsTable();
  const appliedRows = await getAppliedMigrations();

  if (appliedRows.length === 0) {
    console.log('Geri alinacak migration yok.\n');
    return;
  }

  // Son N migration (ters sirada)
  const toRollback = appliedRows.slice(-count).reverse();

  console.log(toRollback.length + ' migration geri alinacak:\n');

  for (const row of toRollback) {
    const filepath = path.join(MIGRATIONS_DIR, row.filename);
    if (!fs.existsSync(filepath)) {
      console.error('  \u2717 ' + row.filename + ' — dosya bulunamadi!');
      continue;
    }

    const sql = fs.readFileSync(filepath, 'utf8');
    const { down } = parseMigration(sql);

    if (!down) {
      console.error('  \u2717 ' + row.filename + ' — DOWN bolumu yok, geri alinamiyor!');
      console.error('    Dosyaya "-- DOWN" isaretcisi ekleyip altina rollback SQL\'i yazin.');
      throw new Error('DOWN section missing in ' + row.filename);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(down);
      await client.query('DELETE FROM schema_migrations WHERE filename = $1', [row.filename]);
      await client.query('COMMIT');
      console.log('  \u21A9 ' + row.filename + ' geri alindi');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('  \u2717 ' + row.filename + ' — ' + err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('\nRollback tamamlandi.\n');
}

function pad(str, len) {
  str = String(str);
  while (str.length < len) str += ' ';
  return str;
}

/* ═══════════════════════════════════════════
   CLI Entry
   ═══════════════════════════════════════════ */

// Programmatic API — require('./migrate') ile kullanilir
module.exports = { runPending, status, rollback };

// CLI olarak calistirildiginda
if (require.main === module) {
  const cmd = process.argv[2] || 'up';

  (async () => {
    try {
      switch (cmd) {
        case 'up':
        case 'migrate':
          await runPending({});
          break;
        case 'status':
          await status();
          break;
        case 'rollback':
        case 'down': {
          const n = parseInt(process.argv[3], 10) || 1;
          await rollback(n);
          break;
        }
        default:
          console.log('Kullanim:');
          console.log('  node migrate.js              — Bekleyen migration\'lari uygula');
          console.log('  node migrate.js status        — Durum tablosu');
          console.log('  node migrate.js rollback [N]  — Son N migration\'i geri al');
      }
      process.exit(0);
    } catch (err) {
      console.error('\nMigration hatasi:', err.message);
      process.exit(1);
    }
  })();
}
