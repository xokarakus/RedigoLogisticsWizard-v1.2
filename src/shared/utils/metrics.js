/**
 * Prometheus-compatible Metrics Collector
 *
 * /metrics endpoint'i icin temel metrikleri toplar.
 * Harici kutuphane gerektirmez — text/plain Prometheus format.
 */

const counters = {};
const histograms = {};
const gauges = {};

const startTime = Date.now();
const MAX_LABEL_KEYS = 500;

/** Route label'da UUID/sayi segmentlerini normalize et */
function _normalizeRoute(route) {
  if (!route) return route;
  return route
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+/g, '/:id');
}

/** Counter artir */
function incCounter(name, labels = {}, value = 1) {
  const key = _key(name, labels);
  if (!counters[key] && Object.keys(counters).length >= MAX_LABEL_KEYS) {
    const overflowKey = _key(name, { __overflow__: 'true' });
    if (!counters[overflowKey]) counters[overflowKey] = { name, labels: { __overflow__: 'true' }, value: 0 };
    counters[overflowKey].value += value;
    return;
  }
  if (!counters[key]) counters[key] = { name, labels, value: 0 };
  counters[key].value += value;
}

/** Gauge set et */
function setGauge(name, labels = {}, value) {
  const key = _key(name, labels);
  gauges[key] = { name, labels, value };
}

/** Histogram observe */
function observeHistogram(name, labels = {}, value) {
  const key = _key(name, labels);
  if (!histograms[key] && Object.keys(histograms).length >= MAX_LABEL_KEYS) {
    const overflowKey = _key(name, { __overflow__: 'true' });
    if (!histograms[overflowKey]) histograms[overflowKey] = { name, labels: { __overflow__: 'true' }, count: 0, sum: 0, buckets: {} };
    const oh = histograms[overflowKey];
    oh.count++;
    oh.sum += value;
    return;
  }
  if (!histograms[key]) {
    histograms[key] = { name, labels, count: 0, sum: 0, buckets: {} };
  }
  const h = histograms[key];
  h.count++;
  h.sum += value;
  // Default bucket'lar (ms cinsinden)
  const defaultBuckets = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000];
  for (const b of defaultBuckets) {
    if (!h.buckets[b]) h.buckets[b] = 0;
    if (value <= b) h.buckets[b]++;
  }
}

function _key(name, labels) {
  const parts = Object.entries(labels).sort().map(([k, v]) => k + '=' + v);
  return name + '{' + parts.join(',') + '}';
}

function _labelStr(labels) {
  const parts = Object.entries(labels).map(([k, v]) => k + '="' + v + '"');
  return parts.length > 0 ? '{' + parts.join(',') + '}' : '';
}

/** Prometheus text format ciktisi */
function serialize() {
  const lines = [];

  // Process metrics
  const mem = process.memoryUsage();
  lines.push('# HELP process_resident_memory_bytes Resident memory size in bytes');
  lines.push('# TYPE process_resident_memory_bytes gauge');
  lines.push('process_resident_memory_bytes ' + mem.rss);

  lines.push('# HELP process_heap_used_bytes Heap used in bytes');
  lines.push('# TYPE process_heap_used_bytes gauge');
  lines.push('process_heap_used_bytes ' + mem.heapUsed);

  lines.push('# HELP process_uptime_seconds Process uptime in seconds');
  lines.push('# TYPE process_uptime_seconds gauge');
  lines.push('process_uptime_seconds ' + Math.floor(process.uptime()));

  lines.push('# HELP nodejs_eventloop_lag_seconds Event loop lag');
  lines.push('# TYPE nodejs_eventloop_lag_seconds gauge');

  // Counters
  const counterNames = new Set(Object.values(counters).map(c => c.name));
  for (const name of counterNames) {
    lines.push('# HELP ' + name + ' Counter');
    lines.push('# TYPE ' + name + ' counter');
    for (const c of Object.values(counters)) {
      if (c.name === name) {
        lines.push(name + _labelStr(c.labels) + ' ' + c.value);
      }
    }
  }

  // Gauges
  const gaugeNames = new Set(Object.values(gauges).map(g => g.name));
  for (const name of gaugeNames) {
    lines.push('# HELP ' + name + ' Gauge');
    lines.push('# TYPE ' + name + ' gauge');
    for (const g of Object.values(gauges)) {
      if (g.name === name) {
        lines.push(name + _labelStr(g.labels) + ' ' + g.value);
      }
    }
  }

  // Histograms
  const histNames = new Set(Object.values(histograms).map(h => h.name));
  for (const name of histNames) {
    lines.push('# HELP ' + name + ' Histogram');
    lines.push('# TYPE ' + name + ' histogram');
    for (const h of Object.values(histograms)) {
      if (h.name !== name) continue;
      const ls = _labelStr(h.labels);
      const buckets = Object.entries(h.buckets).sort((a, b) => Number(a[0]) - Number(b[0]));
      for (const [le, count] of buckets) {
        lines.push(name + '_bucket{le="' + le + '"' + (ls ? ',' + ls.slice(1, -1) : '') + '} ' + count);
      }
      lines.push(name + '_bucket{le="+Inf"' + (ls ? ',' + ls.slice(1, -1) : '') + '} ' + h.count);
      lines.push(name + '_sum' + ls + ' ' + h.sum.toFixed(3));
      lines.push(name + '_count' + ls + ' ' + h.count);
    }
  }

  return lines.join('\n') + '\n';
}

/** Express middleware: her istegi say ve latency olc */
function metricsMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const rawRoute = req.route ? req.route.path : req.path;
    const route = _normalizeRoute(rawRoute);
    const method = req.method;
    const status = String(res.statusCode);

    incCounter('http_requests_total', { method, status });
    observeHistogram('http_request_duration_ms', { method, route }, duration);
  });
  next();
}

module.exports = {
  incCounter, setGauge, observeHistogram,
  serialize, metricsMiddleware
};
