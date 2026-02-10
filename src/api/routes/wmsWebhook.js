const { Router } = require('express');
const { WmsConfirmationSchema } = require('../../modules/work-order/validators/wmsConfirmation.schema');
const deliveryService = require('../../modules/work-order/services/DeliveryExecutionService');
const { query } = require('../../shared/database/pool');
const logger = require('../../shared/utils/logger');

const router = Router();

// POST /api/wms/confirmation - WMS sends pick/receipt confirmation
router.post('/confirmation', async (req, res) => {
  try {
    // Validate incoming payload with Zod
    const parsed = WmsConfirmationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      });
    }

    const confirmation = parsed.data;

    // Find work order by delivery number
    const woResult = await query(
      `SELECT id, order_type, status FROM work_orders WHERE sap_delivery_no = $1`,
      [confirmation.delivery_no]
    );

    if (woResult.rows.length === 0) {
      return res.status(404).json({ error: `Work order not found for delivery: ${confirmation.delivery_no}` });
    }

    const workOrder = woResult.rows[0];

    // Route to correct handler based on type
    let result;
    if (workOrder.order_type === 'OUTBOUND') {
      result = await deliveryService.processOutboundConfirmation(workOrder.id, confirmation);
    } else {
      result = await deliveryService.processInboundConfirmation(workOrder.id, confirmation);
    }

    res.json(result);
  } catch (err) {
    logger.error('WMS confirmation processing failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
