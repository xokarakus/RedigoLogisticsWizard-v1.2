/**
 * Stress Test — CLI Dashboard
 */

const SCENARIOS_LIST = ['dashboard', 'work-orders', 'ingest', 'confirmation', 'config', 'transactions', 'auth-me'];

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function render(metrics, config) {
  console.clear();

  const elapsed = Math.floor((Date.now() - metrics.startTime) / 1000);
  const activeUsers = Object.values(metrics.tenants).reduce((s, t) => s + t.activeUsers, 0);
  const totalOk = metrics.totalSuccess;
  const totalErr = metrics.totalFailed;
  const total = totalOk + totalErr;
  const okPct = total > 0 ? (totalOk / total * 100).toFixed(1) : '0.0';
  const throughput = elapsed > 0 ? (total / elapsed).toFixed(1) : '0';
  const avgLatency = metrics.latencies.length > 0
    ? Math.round(metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length)
    : 0;

  const W = 62;
  const line = '═'.repeat(W);
  const thin = '─'.repeat(W);

  console.log('╔' + line + '╗');
  console.log('║  REDIGO STRESS TEST — ' + pad(config.totalUsers + ' Users / ' + config.tenantCount + ' Tenants', W - 24) + '║');
  console.log('╠' + line + '╣');
  console.log('║ Elapsed: ' + pad(elapsed + 's / ' + config.duration + 's', 18) +
    'Active: ' + pad(activeUsers + '/' + config.totalUsers, 14) +
    pad('', W - 44) + '║');
  console.log('║ Total: ' + pad(fmt(total), 10) +
    'OK: ' + pad(fmt(totalOk) + ' (' + okPct + '%)', 20) +
    'ERR: ' + pad(fmt(totalErr), 8) +
    pad('', W - 54) + '║');
  console.log('║ Throughput: ' + pad(throughput + ' req/s', 14) +
    'Avg: ' + pad(avgLatency + 'ms', 10) +
    'P95: ' + pad(percentile(metrics.latencies, 95) + 'ms', 10) +
    pad('', W - 53) + '║');
  console.log('╠' + line + '╣');

  // Tenant breakdown
  console.log('║ ' + pad('Tenant', 12) + pad('Users', 7) + pad('Req', 8) + pad('OK%', 8) + pad('Avg', 8) + pad('P95', 8) + pad('', W - 53) + '║');
  console.log('║ ' + thin.substring(0, W) + ' ║');

  const tenantCodes = Object.keys(metrics.tenants).sort();
  for (const code of tenantCodes) {
    const t = metrics.tenants[code];
    const tTotal = t.ok + t.fail;
    const tPct = tTotal > 0 ? (t.ok / tTotal * 100).toFixed(1) + '%' : '-';
    const tAvg = t.latencies.length > 0
      ? Math.round(t.latencies.reduce((a, b) => a + b, 0) / t.latencies.length)
      : 0;
    const tP95 = percentile(t.latencies, 95);
    console.log('║ ' + pad(code, 12) + pad(String(t.activeUsers), 7) + pad(fmt(tTotal), 8) +
      pad(tPct, 8) + pad(tAvg + 'ms', 8) + pad(tP95 + 'ms', 8) + pad('', W - 53) + '║');
  }

  console.log('╠' + line + '╣');

  // Endpoint breakdown
  console.log('║ ' + pad('Endpoint', 16) + pad('Count', 8) + pad('OK%', 8) + pad('Avg', 8) + pad('P95', 8) + pad('', W - 50) + '║');
  console.log('║ ' + thin.substring(0, W) + ' ║');

  for (const name of SCENARIOS_LIST) {
    const s = metrics.scenarios[name];
    if (!s) continue;
    const sTotal = s.ok + s.fail;
    if (sTotal === 0) continue;
    const sPct = (s.ok / sTotal * 100).toFixed(1) + '%';
    const sAvg = s.latencies.length > 0
      ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length)
      : 0;
    const sP95 = percentile(s.latencies, 95);
    console.log('║ ' + pad(name, 16) + pad(fmt(sTotal), 8) + pad(sPct, 8) +
      pad(sAvg + 'ms', 8) + pad(sP95 + 'ms', 8) + pad('', W - 50) + '║');
  }

  console.log('╠' + line + '╣');

  // Errors
  const errCodes = Object.entries(metrics.errorCodes).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const errStr = errCodes.map(([code, count]) => code + '(' + count + ')').join('  ');
  console.log('║ Errors: ' + pad(errStr || 'none', W - 10) + '║');
  console.log('╚' + line + '╝');
}

function pad(str, len) {
  str = String(str);
  return str.length >= len ? str.substring(0, len) : str + ' '.repeat(len - str.length);
}

function fmt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

module.exports = { render, percentile };
