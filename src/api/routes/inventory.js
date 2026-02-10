const { Router } = require('express');
const { query } = require('../../shared/database/pool');
const logger = require('../../shared/utils/logger');

const router = Router();

// POST /api/inventory/movement - WMS reports inventory movement
router.post('/movement', async (req, res) => {
  try {
    const { warehouse_code, wms_action_code, material, quantity, batch, uom } = req.body;

    // Look up mapping
    const mapResult = await query(
      `SELECT mm.*, w.id as warehouse_id
       FROM movement_mappings mm
       JOIN warehouses w ON mm.warehouse_id = w.id
       WHERE w.code = $1 AND mm.wms_action_code = $2 AND mm.is_active = true`,
      [warehouse_code, wms_action_code]
    );

    if (mapResult.rows.length === 0) {
      return res.status(400).json({
        error: `No mapping found for warehouse=${warehouse_code}, action=${wms_action_code}`,
      });
    }

    const mapping = mapResult.rows[0];

    // Log transaction
    const txResult = await query(
      `INSERT INTO transaction_logs
       (movement_mapping_id, direction, action, status, sap_function, sap_request)
       VALUES ($1, 'WMS_TO_SAP', $2, 'PENDING', 'BAPI_GOODSMVT_CREATE', $3)
       RETURNING id`,
      [
        mapping.id,
        `INV_${wms_action_code}`,
        JSON.stringify({ material, quantity, batch, uom, movement_type: mapping.sap_movement_type }),
      ]
    );

    logger.info('Inventory movement queued', {
      txId: txResult.rows[0].id,
      action: wms_action_code,
      sapMvtType: mapping.sap_movement_type,
      material,
    });

    res.status(202).json({
      transaction_id: txResult.rows[0].id,
      sap_movement_type: mapping.sap_movement_type,
      status: 'PENDING',
    });
  } catch (err) {
    logger.error('Inventory movement failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/mappings - List movement mappings
router.get('/mappings', async (req, res) => {
  try {
    const result = await query(
      `SELECT mm.*, w.code as warehouse_code
       FROM movement_mappings mm
       JOIN warehouses w ON mm.warehouse_id = w.id
       WHERE mm.is_active = true
       ORDER BY w.code, mm.wms_action_code`
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
