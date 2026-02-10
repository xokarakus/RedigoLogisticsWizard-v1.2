#!/usr/bin/env node

/**
 * Redigo Traffic Simulator (Test Agent)
 *
 * Matrix-style CLI dashboard that stress-tests the Logistics Cockpit.
 * Generates random SAP Deliveries and WMS Confirmations, then pumps
 * them through the API to validate throughput and resilience.
 *
 * Usage: node tools/traffic-agent/index.js [--rate 10] [--duration 60]
 */

const Table = require('cli-table3');
const chalk = require('chalk');
const { generateDelivery, generateWmsConfirmation } = require('./generators');

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const API_BASE = process.env.API_URL || 'http://localhost:3000';
const args = process.argv.slice(2);
const RATE = parseInt(getArg('--rate') || '5', 10);         // requests per second
const DURATION = parseInt(getArg('--duration') || '60', 10); // seconds
const SCENARIO = getArg('--scenario') || 'mixed';            // outbound, inbound, mixed

// ─────────────────────────────────────────────
// METRICS
// ─────────────────────────────────────────────
const metrics = {
  totalSent: 0,
  totalSuccess: 0,
  totalFailed: 0,
  totalRetries: 0,
  activeRequests: 0,
  queueSize: 0,
  avgLatencyMs: 0,
  latencies: [],
  errors: {},
  startTime: null,
};

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
function renderDashboard() {
  console.clear();

  const elapsed = ((Date.now() - metrics.startTime) / 1000).toFixed(0);
  const throughput = metrics.totalSent > 0
    ? (metrics.totalSuccess / (elapsed || 1)).toFixed(1)
    : '0.0';

  // Header
  console.log(chalk.green.bold('\n  ╔══════════════════════════════════════════════╗'));
  console.log(chalk.green.bold('  ║') + chalk.white.bold('   REDIGO TRAFFIC SIMULATOR v1.2              ') + chalk.green.bold('║'));
  console.log(chalk.green.bold('  ╚══════════════════════════════════════════════╝\n'));

  // Status bar
  const progress = Math.min(100, (elapsed / DURATION) * 100).toFixed(0);
  const bar = '█'.repeat(Math.floor(progress / 2.5)) + '░'.repeat(40 - Math.floor(progress / 2.5));
  console.log(chalk.cyan(`  [${bar}] ${progress}%  (${elapsed}s / ${DURATION}s)\n`));

  // Main metrics table
  const table = new Table({
    head: [
      chalk.white.bold('Metric'),
      chalk.white.bold('Value'),
    ],
    colWidths: [25, 25],
    style: { head: [], border: ['green'] },
  });

  table.push(
    ['Scenario', chalk.yellow(SCENARIO.toUpperCase())],
    ['Target Rate', `${RATE} req/s`],
    ['Total Sent', chalk.cyan(metrics.totalSent.toString())],
    ['Successful', chalk.green(metrics.totalSuccess.toString())],
    ['Failed', metrics.totalFailed > 0 ? chalk.red(metrics.totalFailed.toString()) : '0'],
    ['Retries', chalk.yellow(metrics.totalRetries.toString())],
    ['Active Requests', chalk.magenta(metrics.activeRequests.toString())],
    ['Throughput', chalk.green.bold(`${throughput} req/s`)],
    ['Avg Latency', `${metrics.avgLatencyMs.toFixed(0)} ms`],
  );

  console.log(table.toString());

  // Error breakdown
  const errorKeys = Object.keys(metrics.errors);
  if (errorKeys.length > 0) {
    console.log(chalk.red.bold('\n  ERRORS:'));
    const errTable = new Table({
      head: [chalk.white('Code'), chalk.white('Count')],
      colWidths: [30, 15],
      style: { head: [], border: ['red'] },
    });
    errorKeys.forEach((code) => {
      errTable.push([code, chalk.red(metrics.errors[code].toString())]);
    });
    console.log(errTable.toString());
  }

  // Recent activity feed
  console.log(chalk.gray(`\n  Last activity: ${new Date().toISOString()}`));
}

// ─────────────────────────────────────────────
// HTTP CLIENT
// ─────────────────────────────────────────────
async function sendRequest(endpoint, payload) {
  const start = Date.now();
  metrics.activeRequests++;

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    const latency = Date.now() - start;
    metrics.latencies.push(latency);

    // Keep last 100 latencies for avg
    if (metrics.latencies.length > 100) metrics.latencies.shift();
    metrics.avgLatencyMs = metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length;

    if (res.ok) {
      metrics.totalSuccess++;
    } else {
      metrics.totalFailed++;
      const errKey = `HTTP_${res.status}`;
      metrics.errors[errKey] = (metrics.errors[errKey] || 0) + 1;
    }
  } catch (err) {
    metrics.totalFailed++;
    const errKey = err.name === 'TimeoutError' ? 'TIMEOUT' : (err.code || 'NETWORK_ERROR');
    metrics.errors[errKey] = (metrics.errors[errKey] || 0) + 1;
  } finally {
    metrics.activeRequests--;
    metrics.totalSent++;
  }
}

// ─────────────────────────────────────────────
// SCENARIO RUNNERS
// ─────────────────────────────────────────────
function getRandomEndpointAndPayload() {
  const roll = Math.random();

  if (SCENARIO === 'outbound' || (SCENARIO === 'mixed' && roll < 0.4)) {
    return ['/api/work-orders/ingest', generateDelivery('OUTBOUND')];
  } else if (SCENARIO === 'inbound' || (SCENARIO === 'mixed' && roll < 0.8)) {
    return ['/api/work-orders/ingest', generateDelivery('INBOUND')];
  } else {
    return ['/api/wms/confirmation', generateWmsConfirmation()];
  }
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
async function main() {
  console.log(chalk.green.bold('\nRedigo Traffic Simulator starting...'));
  console.log(chalk.gray(`  Target: ${API_BASE}`));
  console.log(chalk.gray(`  Rate: ${RATE} req/s | Duration: ${DURATION}s | Scenario: ${SCENARIO}\n`));

  metrics.startTime = Date.now();

  // Dashboard refresh interval
  const dashboardInterval = setInterval(renderDashboard, 500);

  // Request generator interval
  const interval = 1000 / RATE;
  const requestInterval = setInterval(() => {
    const [endpoint, payload] = getRandomEndpointAndPayload();
    sendRequest(endpoint, payload);
  }, interval);

  // Stop after duration
  setTimeout(() => {
    clearInterval(requestInterval);
    clearInterval(dashboardInterval);

    // Final render
    renderDashboard();
    console.log(chalk.green.bold('\n  ✔ Simulation complete.\n'));

    // Summary
    const elapsed = ((Date.now() - metrics.startTime) / 1000).toFixed(1);
    console.log(chalk.white(`  Total: ${metrics.totalSent} | Success: ${metrics.totalSuccess} | Failed: ${metrics.totalFailed}`));
    console.log(chalk.white(`  Duration: ${elapsed}s | Avg Latency: ${metrics.avgLatencyMs.toFixed(0)}ms\n`));

    process.exit(0);
  }, DURATION * 1000);
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

main().catch((err) => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});
