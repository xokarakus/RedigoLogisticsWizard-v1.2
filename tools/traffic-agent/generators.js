/**
 * Random data generators for SAP Deliveries and WMS Confirmations
 */

const MATERIALS = [
  { no: '000000001001', desc: 'Laptop HP EliteBook', uom: 'EA', weight: 2.1 },
  { no: '000000001002', desc: 'Monitor Dell 27"', uom: 'EA', weight: 5.4 },
  { no: '000000001003', desc: 'Keyboard Logitech', uom: 'EA', weight: 0.5 },
  { no: '000000002001', desc: 'Paper A4 Box', uom: 'CS', weight: 12.0 },
  { no: '000000002002', desc: 'Toner Cartridge', uom: 'EA', weight: 0.8 },
  { no: '000000003001', desc: 'Cable USB-C 2m', uom: 'EA', weight: 0.1 },
  { no: '000000003002', desc: 'Docking Station', uom: 'EA', weight: 1.2 },
  { no: '000000004001', desc: 'Warehouse Label Roll', uom: 'ROL', weight: 0.3 },
];

const WAREHOUSES = [
  { code: 'WH-IST-01', plant: '1000', sloc: '0001', wms: 'CEVA-IST' },
  { code: 'WH-ANK-01', plant: '2000', sloc: '0001', wms: 'DHL-ANK' },
  { code: 'WH-IZM-01', plant: '3000', sloc: '0002', wms: 'HOPI-IZM' },
];

const DELIVERY_TYPES = {
  OUTBOUND: ['LF', 'NL'],
  INBOUND: ['EL', 'RL'],
};

const CUSTOMERS = ['0000010001', '0000010002', '0000010003', '0000020001', '0000020002'];

let deliveryCounter = 80000000;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateDeliveryNo() {
  deliveryCounter++;
  return deliveryCounter.toString().padStart(10, '0');
}

/**
 * Generate a fake SAP Delivery (LIKP/LIPS structure)
 */
function generateDelivery(type = 'OUTBOUND') {
  const wh = randomItem(WAREHOUSES);
  const lineCount = randomInt(1, 5);
  const lines = [];

  for (let i = 0; i < lineCount; i++) {
    const mat = randomItem(MATERIALS);
    lines.push({
      sap_item_no: ((i + 1) * 10).toString().padStart(6, '0'),
      sap_material: mat.no,
      description: mat.desc,
      sap_requested_qty: randomInt(1, 200),
      sap_uom: mat.uom,
      sap_batch: Math.random() > 0.7 ? `B${randomInt(1000, 9999)}` : null,
    });
  }

  return {
    sap_delivery_no: generateDeliveryNo(),
    sap_delivery_type: randomItem(DELIVERY_TYPES[type] || ['LF']),
    sap_doc_date: new Date().toISOString().slice(0, 10),
    sap_ship_to: randomItem(CUSTOMERS),
    order_type: type,
    warehouse_code: wh.code,
    lines,
  };
}

/**
 * Generate a fake WMS Confirmation
 */
function generateWmsConfirmation() {
  const wh = randomItem(WAREHOUSES);
  const lineCount = randomInt(1, 3);
  const lines = [];

  for (let i = 0; i < lineCount; i++) {
    const mat = randomItem(MATERIALS);
    const requestedQty = randomInt(10, 200);

    // Simulate: 70% full pick, 20% partial, 10% zero
    const roll = Math.random();
    let pickedQty;
    if (roll < 0.7) pickedQty = requestedQty;
    else if (roll < 0.9) pickedQty = randomInt(1, requestedQty - 1);
    else pickedQty = 0;

    lines.push({
      sap_item_no: ((i + 1) * 10).toString().padStart(6, '0'),
      material: mat.no,
      picked_qty: pickedQty,
      uom: mat.uom,
      is_final: Math.random() > 0.3,
      serial_numbers: mat.uom === 'EA' && pickedQty <= 5
        ? Array.from({ length: pickedQty }, (_, j) => `SN-${randomInt(100000, 999999)}`)
        : [],
      hu_ids: Math.random() > 0.5
        ? [`HU-${randomInt(10000, 99999)}`]
        : [],
    });
  }

  return {
    wms_order_id: `WMS-${randomInt(100000, 999999)}`,
    warehouse_code: wh.code,
    delivery_no: `00${randomInt(80000000, 89999999)}`,
    status: Math.random() > 0.3 ? 'COMPLETE' : 'PARTIAL',
    lines,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { generateDelivery, generateWmsConfirmation };
