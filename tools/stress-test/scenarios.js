/**
 * Stress Test — Senaryolar ve data generator'lar
 */

const API_BASE = process.env.API_URL || 'http://localhost:3000';

// Ağırlıklı senaryo seçimi
const SCENARIOS = [
  { name: 'dashboard',    weight: 20, method: 'GET',  path: '/api/v1/dashboard/kpis' },
  { name: 'work-orders',  weight: 15, method: 'GET',  path: '/api/v1/work-orders?limit=20' },
  { name: 'ingest',       weight: 10, method: 'POST', path: '/api/v1/work-orders/ingest', bodyFn: generateDelivery },
  { name: 'confirmation', weight: 8,  method: 'POST', path: '/api/v1/wms/confirmation', bodyFn: generateConfirmation },
  { name: 'config',       weight: 10, method: 'GET',  path: '/api/v1/config/warehouses' },
  { name: 'transactions', weight: 8,  method: 'GET',  path: '/api/v1/transactions?limit=20' },
  { name: 'auth-me',      weight: 4,  method: 'GET',  path: '/api/v1/auth/me' },
  { name: 'mat-list',     weight: 10, method: 'GET',  path: '/api/master-data/materials?limit=50' },
  { name: 'mat-create',   weight: 8,  method: 'POST', path: '/api/master-data/materials', bodyFn: generateMaterial },
  { name: 'partner-list', weight: 7,  method: 'GET',  path: '/api/master-data/partners?limit=50' },
];

// Cumulative weight array for weighted random selection
const TOTAL_WEIGHT = SCENARIOS.reduce((s, sc) => s + sc.weight, 0);

function pickScenario() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const sc of SCENARIOS) {
    r -= sc.weight;
    if (r <= 0) return sc;
  }
  return SCENARIOS[0];
}

// ── Data Generators ──

let deliveryCounter = 90000000;
const MATERIALS = ['MAT-001', 'MAT-002', 'MAT-003', 'MAT-004', 'MAT-005'];
const WAREHOUSES = ['WH-IST-01', 'WH-ANK-01'];
const DELIVERY_TYPES = ['EL', 'LF', 'NL'];

function generateDelivery() {
  const num = String(deliveryCounter++);
  const lineCount = 1 + Math.floor(Math.random() * 3);
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push({
      item_no: String((i + 1) * 10).padStart(6, '0'),
      material: MATERIALS[Math.floor(Math.random() * MATERIALS.length)],
      material_description: 'Stress Test Material ' + (i + 1),
      quantity: 1 + Math.floor(Math.random() * 100),
      uom: 'EA',
      batch: 'BATCH-' + Math.floor(Math.random() * 999),
      plant: '1000',
      storage_location: '0001'
    });
  }

  return {
    sap_delivery_no: num,
    sap_delivery_type: DELIVERY_TYPES[Math.floor(Math.random() * DELIVERY_TYPES.length)],
    warehouse_code: WAREHOUSES[Math.floor(Math.random() * WAREHOUSES.length)],
    order_type: Math.random() > 0.5 ? 'OUTBOUND' : 'INBOUND',
    ship_to_party: 'CUST-' + Math.floor(Math.random() * 100),
    sold_to_party: 'SOLD-' + Math.floor(Math.random() * 50),
    planned_gi_date: new Date().toISOString().split('T')[0],
    lines
  };
}

function generateConfirmation() {
  return {
    wms_order_id: 'WMS-' + Math.floor(Math.random() * 999999),
    delivery_no: String(80000000 + Math.floor(Math.random() * 9999999)),
    warehouse_code: WAREHOUSES[Math.floor(Math.random() * WAREHOUSES.length)],
    status: ['PARTIAL', 'COMPLETE'][Math.floor(Math.random() * 2)],
    timestamp: new Date().toISOString(),
    lines: [{
      sap_item_no: '000010',
      material: MATERIALS[Math.floor(Math.random() * MATERIALS.length)],
      picked_qty: 1 + Math.floor(Math.random() * 50),
      uom: 'EA'
    }]
  };
}

let materialCounter = 50000;
const MATERIAL_GROUPS = ['ELEC', 'METAL', 'PLAST', 'CHEM', 'PACK', 'SPARE', 'RAW', 'CONN', 'CABLE', 'PAINT'];
const UOMS = ['EA', 'KG', 'LT', 'MT', 'ST'];

function generateMaterial() {
  const num = String(materialCounter++);
  return {
    sap_material_no: 'STR-' + num,
    description: 'Stress Material ' + num,
    material_group: MATERIAL_GROUPS[Math.floor(Math.random() * MATERIAL_GROUPS.length)],
    base_uom: UOMS[Math.floor(Math.random() * UOMS.length)],
    gross_weight: +(Math.random() * 50).toFixed(2),
    weight_unit: 'KG'
  };
}

// ── Request Executor ──

async function executeScenario(token) {
  const scenario = pickScenario();
  const opts = {
    method: scenario.method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    }
  };

  if (scenario.bodyFn) {
    opts.body = JSON.stringify(scenario.bodyFn());
  }

  const start = Date.now();
  try {
    const res = await fetch(API_BASE + scenario.path, opts);
    const latency = Date.now() - start;
    // 404 on confirmation is expected (random delivery_no may not exist)
    const ok = res.status >= 200 && res.status < 400
      || (scenario.name === 'confirmation' && res.status === 404)
      || (scenario.name === 'mat-create' && res.status === 409);
    return { scenario: scenario.name, ok, status: res.status, latency };
  } catch (err) {
    const latency = Date.now() - start;
    return { scenario: scenario.name, ok: false, status: 0, latency, error: err.message };
  }
}

module.exports = { pickScenario, executeScenario, SCENARIOS };
