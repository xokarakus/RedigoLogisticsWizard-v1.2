const { Router } = require('express');
const { query } = require('../../shared/database/pool');
const logger = require('../../shared/utils/logger');

const router = Router();

// POST /api/work-orders/ingest - Ingest delivery from SAP (or traffic agent)
router.post('/ingest', async (req, res) => {
  try {
    const payload = req.body;

    // Find warehouse
    const whResult = await query(
      `SELECT id FROM warehouses WHERE code = $1 AND is_active = true`,
      [payload.warehouse_code]
    );
    const warehouseId = whResult.rows[0]?.id;
    if (!warehouseId) {
      return res.status(400).json({ error: `Unknown warehouse: ${payload.warehouse_code}` });
    }

    // Insert work order
    const woResult = await query(
      `INSERT INTO work_orders
       (sap_delivery_no, sap_delivery_type, sap_doc_date, sap_ship_to,
        order_type, warehouse_id, sap_raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (sap_delivery_no) DO UPDATE SET
         sap_raw_payload = EXCLUDED.sap_raw_payload, updated_at = now()
       RETURNING id, status`,
      [
        payload.sap_delivery_no,
        payload.sap_delivery_type,
        payload.sap_doc_date,
        payload.sap_ship_to,
        payload.order_type,
        warehouseId,
        JSON.stringify(payload),
      ]
    );

    const workOrderId = woResult.rows[0].id;

    // Insert lines
    if (payload.lines) {
      for (const line of payload.lines) {
        await query(
          `INSERT INTO work_order_lines
           (work_order_id, sap_item_no, sap_material, sap_batch, sap_requested_qty, sap_uom)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (work_order_id, sap_item_no) DO UPDATE SET
             sap_requested_qty = EXCLUDED.sap_requested_qty, updated_at = now()`,
          [workOrderId, line.sap_item_no, line.sap_material, line.sap_batch, line.sap_requested_qty, line.sap_uom]
        );
      }
    }

    logger.info('Work order ingested', {
      id: workOrderId,
      delivery: payload.sap_delivery_no,
      type: payload.order_type,
    });

    res.status(201).json({ id: workOrderId, delivery: payload.sap_delivery_no, status: 'RECEIVED' });
  } catch (err) {
    logger.error('Ingest failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/work-orders - List work orders
router.get('/', async (req, res) => {
  try {
    const { status, type, limit = 50, offset = 0 } = req.query;
    let sql = `SELECT wo.*, w.code as warehouse_code FROM work_orders wo JOIN warehouses w ON wo.warehouse_id = w.id WHERE 1=1`;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND wo.status = $${params.length}`;
    }
    if (type) {
      params.push(type);
      sql += ` AND wo.order_type = $${params.length}`;
    }

    params.push(limit, offset);
    sql += ` ORDER BY wo.received_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    res.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    logger.error('List work orders failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
