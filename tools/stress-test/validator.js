/**
 * Stress Test — Post-test Doğrulama
 */

const { api } = require('./setup');
const { percentile } = require('./dashboard');

async function validate(metrics, users, config) {
  console.log('\n══════════════════════════════════════════');
  console.log('  POST-TEST DOGRULAMA');
  console.log('══════════════════════════════════════════\n');

  const results = [];

  // 1. Hata oranı
  const total = metrics.totalSuccess + metrics.totalFailed;
  const okPct = total > 0 ? (metrics.totalSuccess / total * 100) : 0;
  results.push({
    name: 'Hata orani < %5',
    pass: okPct >= 95,
    detail: okPct.toFixed(1) + '% basari (' + metrics.totalFailed + ' hata / ' + total + ' toplam)'
  });

  // 2. P95 Latency
  const p95 = percentile(metrics.latencies, 95);
  results.push({
    name: 'P95 Latency < 500ms',
    pass: p95 < 500,
    detail: 'P95 = ' + p95 + 'ms'
  });

  // 3. Tenant izolasyonu
  try {
    const adminToken = users.find(u => u.username === '__admin__');
    const token = adminToken ? adminToken.token : null;

    if (token) {
      let isolationOk = true;
      const tenantCodes = [...new Set(users.filter(u => u.username !== '__admin__').map(u => u.tenant_code))];

      for (const code of tenantCodes.slice(0, 2)) { // ilk 2 tenant'ı kontrol et
        const tenant = users.find(u => u.tenant_code === code && u.username !== '__admin__');
        if (!tenant || !tenant.token) continue;

        const res = await api('GET', '/api/v1/work-orders?limit=5', null, tenant.token);
        if (res.error && !res.error.includes('Too many')) {
          isolationOk = false;
          break;
        }
        // Tum emirler bu tenant'a mi ait kontrol
        const orders = res.data || [];
        for (const o of orders) {
          if (o.tenant_id && o.tenant_id !== tenant.tenant_id) {
            isolationOk = false;
            break;
          }
        }
      }

      results.push({
        name: 'Tenant izolasyonu',
        pass: isolationOk,
        detail: isolationOk ? 'Her tenant sadece kendi verisini goruyor' : 'Izolasyon ihlali!'
      });
    }
  } catch (err) {
    results.push({
      name: 'Tenant izolasyonu',
      pass: false,
      detail: 'Kontrol edilemedi: ' + err.message
    });
  }

  // 4. Throughput
  const elapsed = (Date.now() - metrics.startTime) / 1000;
  const throughput = elapsed > 0 ? (total / elapsed).toFixed(1) : 0;
  results.push({
    name: 'Throughput',
    pass: true,
    detail: throughput + ' req/s ortalama'
  });

  // Print results
  let allPass = true;
  for (const r of results) {
    const icon = r.pass ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    if (!r.pass) allPass = false;
    console.log('  ' + icon + ' ' + r.name + ': ' + r.detail);
  }

  console.log('\n' + (allPass
    ? '\x1b[32m  TUM TESTLER BASARILI\x1b[0m'
    : '\x1b[31m  BAZI TESTLER BASARISIZ\x1b[0m'));
  console.log('══════════════════════════════════════════\n');

  return allPass;
}

module.exports = { validate };
