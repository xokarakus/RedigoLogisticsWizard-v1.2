#!/usr/bin/env node

/**
 * Redigo Multi-Tenant Stress Test
 *
 * Usage:
 *   node tools/stress-test/index.js [options]
 *
 * Options:
 *   --users N       Users per tenant (default: 20)
 *   --tenants N     Number of tenants (default: 5)
 *   --duration N    Test duration in seconds (default: 120)
 *   --rate N        Target requests/sec per user (default: 1)
 *   --setup-only    Only create tenants/users, don't run test
 *   --cleanup       Delete stress test tenants and exit
 */

const { getAdminToken, setupTenants, applyWizard, setupUsers, seedMaterials, cleanup, api } = require('./setup');
const { executeScenario, SCENARIOS } = require('./scenarios');
const { render } = require('./dashboard');
const { validate } = require('./validator');

// ── CLI Args ──
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

const USERS_PER_TENANT = parseInt(getArg('--users') || '20', 10);
const TENANT_COUNT = parseInt(getArg('--tenants') || '5', 10);
const DURATION = parseInt(getArg('--duration') || '120', 10);
const RATE = parseFloat(getArg('--rate') || '1');
const SETUP_ONLY = args.includes('--setup-only');
const CLEANUP = args.includes('--cleanup');
const TOTAL_USERS = USERS_PER_TENANT * TENANT_COUNT;

// ── Metrics ──
const metrics = {
  startTime: null,
  totalSuccess: 0,
  totalFailed: 0,
  latencies: [],
  errorCodes: {},
  tenants: {},
  scenarios: {}
};

function initMetrics(tenants) {
  for (const t of tenants) {
    metrics.tenants[t.code] = { ok: 0, fail: 0, latencies: [], activeUsers: 0 };
  }
  for (const sc of SCENARIOS) {
    metrics.scenarios[sc.name] = { ok: 0, fail: 0, latencies: [] };
  }
}

function recordResult(result, tenantCode) {
  const { scenario, ok, status, latency } = result;

  // Keep last 2000 latencies for percentile calc
  metrics.latencies.push(latency);
  if (metrics.latencies.length > 2000) metrics.latencies.shift();

  if (ok) {
    metrics.totalSuccess++;
    metrics.tenants[tenantCode].ok++;
    metrics.scenarios[scenario].ok++;
  } else {
    metrics.totalFailed++;
    metrics.tenants[tenantCode].fail++;
    metrics.scenarios[scenario].fail++;
    const code = status || 'timeout';
    metrics.errorCodes[code] = (metrics.errorCodes[code] || 0) + 1;
  }

  metrics.tenants[tenantCode].latencies.push(latency);
  if (metrics.tenants[tenantCode].latencies.length > 500) metrics.tenants[tenantCode].latencies.shift();

  metrics.scenarios[scenario].latencies.push(latency);
  if (metrics.scenarios[scenario].latencies.length > 500) metrics.scenarios[scenario].latencies.shift();
}

// ── User Worker ──
async function userWorker(user, durationMs) {
  const tenantCode = user.tenant_code;
  metrics.tenants[tenantCode].activeUsers++;

  const intervalMs = 1000 / RATE;
  const end = Date.now() + durationMs;

  while (Date.now() < end) {
    const result = await executeScenario(user.token);
    recordResult(result, tenantCode);

    // Jitter: ±30%
    const jitter = intervalMs * (0.7 + Math.random() * 0.6);
    await sleep(jitter);
  }

  metrics.tenants[tenantCode].activeUsers--;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Login Users ──
async function loginUsers(users) {
  const BATCH = 15;
  const tokens = [];

  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (u) => {
      try {
        const res = await api('POST', '/api/v1/auth/login', {
          username: u.username,
          password: u.password
        });
        if (res.token) {
          u.token = res.token;
          return true;
        }
        console.error('  Login failed:', u.username, res.error || '');
        return false;
      } catch (err) {
        console.error('  Login error:', u.username, err.message);
        return false;
      }
    }));

    const ok = results.filter(Boolean).length;
    process.stdout.write('  Login batch ' + Math.floor(i / BATCH + 1) + ': ' + ok + '/' + batch.length + ' OK\n');

    if (i + BATCH < users.length) await sleep(1000);
  }

  return users.filter(u => u.token);
}

// ── Main ──
async function main() {
  console.log('\n  REDIGO MULTI-TENANT STRESS TEST');
  console.log('  ' + '═'.repeat(40) + '\n');

  // Admin login
  console.log('  [1/6] Admin login...');
  const adminToken = await getAdminToken();
  console.log('  OK\n');

  // Cleanup mode
  if (CLEANUP) {
    console.log('  Cleaning up stress test data...');
    const count = await cleanup(adminToken);
    console.log('  ' + count + ' tenant silindi.\n');
    process.exit(0);
  }

  // Setup tenants
  console.log('  [2/6] Tenant olusturma (' + TENANT_COUNT + ' adet)...');
  const tenants = await setupTenants(TENANT_COUNT, adminToken);
  for (const t of tenants) {
    console.log('    ' + (t.existed ? '↩' : '✓') + ' ' + t.code);
  }
  console.log();

  // Apply wizard
  console.log('  [3/6] Wizard sablonlari uygulama...');
  for (const t of tenants) {
    const res = await applyWizard(t.id, adminToken);
    const count = res.counts ? Object.values(res.counts).reduce((a, b) => a + b, 0) : 0;
    console.log('    ' + t.code + ': ' + count + ' kayit' + (res.had_existing ? ' (mevcut)' : ''));
  }
  console.log();

  // Seed materials
  console.log('  [4/6] Malzeme verisi olusturma...');
  const matResult = await seedMaterials(tenants, adminToken);
  console.log('    ' + matResult.created + ' yeni, ' + matResult.existed + ' mevcut');
  console.log();

  // Setup users
  console.log('  [5/6] Kullanici olusturma (' + TOTAL_USERS + ' adet)...');
  const users = await setupUsers(tenants, USERS_PER_TENANT, adminToken);
  const newUsers = users.filter(u => !u.existed).length;
  const existingUsers = users.filter(u => u.existed).length;
  console.log('    ' + newUsers + ' yeni, ' + existingUsers + ' mevcut, toplam: ' + users.length);
  console.log();

  if (SETUP_ONLY) {
    console.log('  Setup tamamlandi (--setup-only). Test icin tekrar calistirin.\n');
    process.exit(0);
  }

  // Login all users
  console.log('  [6/6] Kullanici login (' + users.length + ' adet)...');
  const loggedInUsers = await loginUsers(users);
  console.log('    ' + loggedInUsers.length + '/' + users.length + ' basarili login\n');

  if (loggedInUsers.length === 0) {
    console.error('  HATA: Hic kullanici login olamadi!\n');
    process.exit(1);
  }

  // Add admin token for validation
  loggedInUsers.push({ username: '__admin__', token: adminToken, tenant_code: 'ADMIN' });

  // Init metrics and start
  initMetrics(tenants);
  metrics.startTime = Date.now();

  console.log('  Test basliyor: ' + DURATION + 's, ' + loggedInUsers.length + ' user, rate=' + RATE + ' req/s/user\n');

  // Dashboard refresh interval
  const dashInterval = setInterval(() => {
    render(metrics, { totalUsers: TOTAL_USERS, tenantCount: TENANT_COUNT, duration: DURATION });
  }, 1000);

  // Start all user workers
  const durationMs = DURATION * 1000;
  const workerPromises = loggedInUsers
    .filter(u => u.username !== '__admin__')
    .map(u => userWorker(u, durationMs));

  await Promise.all(workerPromises);

  clearInterval(dashInterval);

  // Final render
  render(metrics, { totalUsers: TOTAL_USERS, tenantCount: TENANT_COUNT, duration: DURATION });

  // Validation
  await validate(metrics, loggedInUsers, { totalUsers: TOTAL_USERS });

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
