const { query, getClient } = require('../../../shared/database/pool');
const sapClient = require('../../../shared/sap/client');
const logger = require('../../../shared/utils/logger');
const { sapQueue } = require('../../../shared/queue/connection');

/**
 * DeliveryExecutionService
 *
 * The heart of Module A: Work Order Engine.
 * Handles the full lifecycle of a delivery from WMS confirmation
 * through SAP posting (PGI for outbound, GR for inbound).
 *
 * Key flows:
 *   OUTBOUND (Partial Pick): WMS picks 80 of 100 -> Update SAP qty -> Post PGI
 *   INBOUND  (Under/Over):   WMS receives qty -> Validate tolerance -> Post GR
 */
class DeliveryExecutionService {

  // ─────────────────────────────────────────────
  // OUTBOUND: Process WMS pick confirmation
  // ─────────────────────────────────────────────
  async processOutboundConfirmation(workOrderId, confirmation) {
    const dbClient = await getClient();
    const txLogId = await this._createTransactionLog(workOrderId, 'SAP_TO_WMS', 'OUTBOUND_CONFIRMATION');

    try {
      await dbClient.query('BEGIN');
      logger.info('Processing outbound confirmation', { workOrderId });

      // 1. Load work order + lines
      const workOrder = await this._getWorkOrder(dbClient, workOrderId);
      if (!workOrder) throw new Error(`WorkOrder ${workOrderId} not found`);

      // 2. Update picked quantities from WMS
      const updatedLines = await this._updatePickedQuantities(dbClient, workOrderId, confirmation.lines);

      // 3. Determine if partial pick
      const hasPartialPick = updatedLines.some(
        (line) => line.wms_picked_qty < line.sap_requested_qty
      );

      if (hasPartialPick) {
        logger.info('Partial pick detected', { workOrderId });
      }

      // 4. Step 1: Update SAP Delivery quantities (if partial)
      if (hasPartialPick) {
        await this._updateSapDeliveryQty(workOrder, updatedLines, txLogId);
      }

      // 5. Step 2: Post Goods Issue (PGI) in SAP
      await this._postGoodsIssue(workOrder, updatedLines, txLogId);

      // 6. Step 3: Update work order status
      await dbClient.query(
        `UPDATE work_orders
         SET status = 'PGI_POSTED', sap_posted_at = now(), completed_at = now(), wms_raw_payload = $2
         WHERE id = $1`,
        [workOrderId, JSON.stringify(confirmation)]
      );

      // 7. Handle remainder (close or backorder)
      if (hasPartialPick) {
        await this._handleRemainder(dbClient, workOrder, updatedLines);
      }

      await dbClient.query('COMMIT');
      await this._completeTransactionLog(txLogId, 'SUCCESS');

      logger.info('Outbound confirmation processed successfully', {
        workOrderId,
        deliveryNo: workOrder.sap_delivery_no,
        partial: hasPartialPick,
      });

      return { success: true, workOrderId, partial: hasPartialPick };

    } catch (error) {
      await dbClient.query('ROLLBACK');
      await this._failTransactionLog(txLogId, error);
      logger.error('Outbound confirmation failed', { workOrderId, error: error.message });
      throw error;
    } finally {
      dbClient.release();
    }
  }

  // ─────────────────────────────────────────────
  // INBOUND: Process WMS goods receipt confirmation
  // ─────────────────────────────────────────────
  async processInboundConfirmation(workOrderId, confirmation) {
    const dbClient = await getClient();
    const txLogId = await this._createTransactionLog(workOrderId, 'WMS_TO_SAP', 'INBOUND_CONFIRMATION');

    try {
      await dbClient.query('BEGIN');
      logger.info('Processing inbound confirmation', { workOrderId });

      const workOrder = await this._getWorkOrder(dbClient, workOrderId);
      if (!workOrder) throw new Error(`WorkOrder ${workOrderId} not found`);

      // Update received quantities
      const updatedLines = await this._updatePickedQuantities(dbClient, workOrderId, confirmation.lines);

      // Validate over/under delivery per line
      for (const line of updatedLines) {
        const receivedQty = line.wms_picked_qty;
        const requestedQty = line.sap_requested_qty;

        if (receivedQty > requestedQty) {
          // OVER delivery - check tolerance
          await this._validateOverDelivery(workOrder, line);
        }
      }

      // Determine if this is the final receipt
      const isFinal = confirmation.status === 'COMPLETE' ||
        confirmation.lines.every((l) => l.is_final);

      // Post Goods Receipt in SAP (BAPI_GOODSMVT_CREATE, mvt type 101)
      await this._postGoodsReceipt(workOrder, updatedLines, isFinal, txLogId);

      // Update status
      const newStatus = isFinal ? 'GR_POSTED' : 'PARTIALLY_DONE';
      await dbClient.query(
        `UPDATE work_orders
         SET status = $2, sap_posted_at = CASE WHEN $3 THEN now() ELSE sap_posted_at END,
             completed_at = CASE WHEN $3 THEN now() ELSE completed_at END,
             wms_raw_payload = $4
         WHERE id = $1`,
        [workOrderId, newStatus, isFinal, JSON.stringify(confirmation)]
      );

      // If final and under-delivery, set ELIKZ (delivery completed indicator)
      if (isFinal) {
        const hasUnderDelivery = updatedLines.some(
          (line) => line.wms_picked_qty < line.sap_requested_qty
        );
        if (hasUnderDelivery) {
          await this._setDeliveryCompleted(workOrder, updatedLines);
        }
      }

      await dbClient.query('COMMIT');
      await this._completeTransactionLog(txLogId, 'SUCCESS');

      logger.info('Inbound confirmation processed', {
        workOrderId,
        deliveryNo: workOrder.sap_delivery_no,
        isFinal,
      });

      return { success: true, workOrderId, isFinal };

    } catch (error) {
      await dbClient.query('ROLLBACK');
      await this._failTransactionLog(txLogId, error);
      logger.error('Inbound confirmation failed', { workOrderId, error: error.message });
      throw error;
    } finally {
      dbClient.release();
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE: SAP BAPI Calls
  // ─────────────────────────────────────────────

  /**
   * Step 1 (Outbound Partial): Update delivery quantities in SAP
   * Uses BAPI_OUTB_DELIVERY_CHANGE to reduce qty to actual picked amount
   */
  async _updateSapDeliveryQty(workOrder, lines, txLogId) {
    const itemData = lines
      .filter((l) => l.wms_picked_qty < l.sap_requested_qty)
      .map((line) => ({
        DELIV_NUMB: workOrder.sap_delivery_no,
        DELIV_ITEM: line.sap_item_no,
        DLV_QTY: line.wms_picked_qty,
        DLV_QTY_IMPU: 'X', // Flag: qty is being changed
      }));

    if (itemData.length === 0) return;

    const sapParams = {
      HEADER_DATA: { DELIV_NUMB: workOrder.sap_delivery_no },
      HEADER_CONTROL: { DELIV_NUMB: workOrder.sap_delivery_no },
      ITEM_DATA: itemData,
      ITEM_CONTROL: itemData.map((i) => ({
        DELIV_NUMB: i.DELIV_NUMB,
        DELIV_ITEM: i.DELIV_ITEM,
        CHG_DELQTY: 'X',
      })),
    };

    await this._logSapRequest(txLogId, 'BAPI_OUTB_DELIVERY_CHANGE', sapParams);
    const result = await sapClient.call('BAPI_OUTB_DELIVERY_CHANGE', sapParams);
    await this._logSapResponse(txLogId, result);

    this._checkBapiReturn(result.RETURN, 'BAPI_OUTB_DELIVERY_CHANGE');

    // Commit the BAPI
    await sapClient.call('BAPI_TRANSACTION_COMMIT', { WAIT: 'X' });

    logger.info('SAP delivery qty updated', {
      delivery: workOrder.sap_delivery_no,
      changedLines: itemData.length,
    });

    // Update local DB with final SAP qty
    for (const line of lines) {
      const finalQty = line.wms_picked_qty < line.sap_requested_qty
        ? line.wms_picked_qty
        : line.sap_requested_qty;

      await query(
        `UPDATE work_order_lines SET sap_final_qty = $1 WHERE id = $2`,
        [finalQty, line.id]
      );
    }
  }

  /**
   * Step 2 (Outbound): Post Goods Issue via WS_DELIVERY_UPDATE
   * WABUC='X' triggers PGI in SAP
   */
  async _postGoodsIssue(workOrder, lines, txLogId) {
    const sapParams = {
      VBKOK_WA: {
        VBELN_VL: workOrder.sap_delivery_no,
        WABUC: 'X', // Post Goods Issue flag
      },
      VBPOK_TAB: lines.map((line) => ({
        VBELN_VL: workOrder.sap_delivery_no,
        POSNR_VL: line.sap_item_no,
        LFIMG: line.sap_final_qty || line.wms_picked_qty,
      })),
    };

    await this._logSapRequest(txLogId, 'WS_DELIVERY_UPDATE', sapParams);
    const result = await sapClient.call('WS_DELIVERY_UPDATE', sapParams);
    await this._logSapResponse(txLogId, result);

    this._checkBapiReturn(result.RETURN, 'WS_DELIVERY_UPDATE');

    logger.info('PGI posted in SAP', {
      delivery: workOrder.sap_delivery_no,
    });
  }

  /**
   * Inbound: Post Goods Receipt via BAPI_GOODSMVT_CREATE (mvt 101)
   */
  async _postGoodsReceipt(workOrder, lines, isFinal, txLogId) {
    const gmItems = lines.map((line) => ({
      MATERIAL: line.sap_material,
      PLANT: workOrder.sap_plant || '',
      STGE_LOC: workOrder.sap_stor_loc || '',
      MOVE_TYPE: '101',
      ENTRY_QNT: line.wms_picked_qty,
      ENTRY_UOM: line.sap_uom,
      PO_NUMBER: '', // Purchase order if applicable
      DELIV_NUMB: workOrder.sap_delivery_no,
      DELIV_ITEM: line.sap_item_no,
      MVT_IND: 'B', // Delivery-based GR
      ...(line.sap_batch && { BATCH: line.sap_batch }),
      ...(isFinal && line.wms_picked_qty < line.sap_requested_qty && {
        DELIV_NUMB_TO_SEARCH: workOrder.sap_delivery_no,
        DELCOMPL: 'X', // ELIKZ - delivery completed
      }),
    }));

    const sapParams = {
      GOODSMVT_HEADER: {
        PSTNG_DATE: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
        DOC_DATE: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      },
      GOODSMVT_CODE: { GM_CODE: '01' }, // 01 = Goods Receipt
      GOODSMVT_ITEM: gmItems,
    };

    await this._logSapRequest(txLogId, 'BAPI_GOODSMVT_CREATE', sapParams);
    const result = await sapClient.call('BAPI_GOODSMVT_CREATE', sapParams);
    await this._logSapResponse(txLogId, result);

    this._checkBapiReturn(result.RETURN, 'BAPI_GOODSMVT_CREATE');
    await sapClient.call('BAPI_TRANSACTION_COMMIT', { WAIT: 'X' });

    const matDoc = result.GOODSMVT_HEADRET?.MAT_DOC;
    logger.info('GR posted in SAP', {
      delivery: workOrder.sap_delivery_no,
      matDoc,
      isFinal,
    });

    return matDoc;
  }

  /**
   * Set ELIKZ (Delivery Completed) for under-delivery lines
   */
  async _setDeliveryCompleted(workOrder, lines) {
    const underLines = lines.filter(
      (l) => l.wms_picked_qty < l.sap_requested_qty
    );

    for (const line of underLines) {
      await query(
        `UPDATE work_order_lines SET is_closed = true WHERE id = $1`,
        [line.id]
      );
    }

    logger.info('Delivery completed indicator set', {
      delivery: workOrder.sap_delivery_no,
      closedLines: underLines.length,
    });
  }

  /**
   * Validate over-delivery against SAP tolerance (UEBTO)
   */
  async _validateOverDelivery(workOrder, line) {
    const overQty = line.wms_picked_qty - line.sap_requested_qty;
    const overPct = (overQty / line.sap_requested_qty) * 100;

    // TODO: Fetch actual UEBTO from SAP material master
    const tolerancePct = 10; // Default 10%

    if (overPct > tolerancePct) {
      throw new Error(
        `Over-delivery exceeds tolerance: ${overPct.toFixed(1)}% > ${tolerancePct}%. ` +
        `Material: ${line.sap_material}, Delivery: ${workOrder.sap_delivery_no}, ` +
        `Requested: ${line.sap_requested_qty}, Received: ${line.wms_picked_qty}`
      );
    }

    logger.warn('Over-delivery within tolerance', {
      delivery: workOrder.sap_delivery_no,
      material: line.sap_material,
      overPct: overPct.toFixed(1),
    });
  }

  /**
   * Handle remainder after partial pick (config-driven)
   */
  async _handleRemainder(dbClient, workOrder, lines) {
    // Load warehouse config to determine remainder strategy
    const whResult = await dbClient.query(
      `SELECT config FROM warehouses WHERE id = $1`,
      [workOrder.warehouse_id]
    );
    const whConfig = whResult.rows[0]?.config || {};
    const strategy = whConfig.remainder_strategy || 'BACKORDER'; // BACKORDER or CLOSE

    const partialLines = lines.filter(
      (l) => l.wms_picked_qty < l.sap_requested_qty
    );

    if (strategy === 'CLOSE') {
      // Close remaining lines
      for (const line of partialLines) {
        await dbClient.query(
          `UPDATE work_order_lines SET is_closed = true WHERE id = $1`,
          [line.id]
        );
      }
      logger.info('Remainder strategy: CLOSE', {
        delivery: workOrder.sap_delivery_no,
        closedLines: partialLines.length,
      });
    } else {
      // BACKORDER: leave lines open for next shipment
      logger.info('Remainder strategy: BACKORDER', {
        delivery: workOrder.sap_delivery_no,
        openLines: partialLines.map((l) => ({
          item: l.sap_item_no,
          remaining: l.sap_requested_qty - l.wms_picked_qty,
        })),
      });
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE: Database Helpers
  // ─────────────────────────────────────────────

  async _getWorkOrder(dbClient, workOrderId) {
    const result = await dbClient.query(
      `SELECT wo.*, w.sap_plant, w.sap_stor_loc, w.config as warehouse_config
       FROM work_orders wo
       JOIN warehouses w ON wo.warehouse_id = w.id
       WHERE wo.id = $1`,
      [workOrderId]
    );
    return result.rows[0] || null;
  }

  async _updatePickedQuantities(dbClient, workOrderId, wmsLines) {
    const updatedLines = [];

    for (const wmsLine of wmsLines) {
      const result = await dbClient.query(
        `UPDATE work_order_lines
         SET wms_picked_qty = $1, wms_uom = $2,
             wms_serial_numbers = $3, wms_hu_ids = $4,
             updated_at = now()
         WHERE work_order_id = $5 AND sap_item_no = $6
         RETURNING *`,
        [
          wmsLine.picked_qty,
          wmsLine.uom || null,
          JSON.stringify(wmsLine.serial_numbers || []),
          JSON.stringify(wmsLine.hu_ids || []),
          workOrderId,
          wmsLine.sap_item_no,
        ]
      );

      if (result.rows[0]) {
        updatedLines.push(result.rows[0]);
      } else {
        logger.warn('WMS line not matched to work order line', {
          workOrderId,
          sapItemNo: wmsLine.sap_item_no,
        });
      }
    }

    return updatedLines;
  }

  // ─────────────────────────────────────────────
  // PRIVATE: Transaction Log Helpers
  // ─────────────────────────────────────────────

  async _createTransactionLog(workOrderId, direction, action) {
    const result = await query(
      `INSERT INTO transaction_logs (work_order_id, direction, action, status)
       VALUES ($1, $2, $3, 'PENDING')
       RETURNING id`,
      [workOrderId, direction, action]
    );
    return result.rows[0].id;
  }

  async _logSapRequest(txLogId, functionName, params) {
    await query(
      `UPDATE transaction_logs SET sap_function = $1, sap_request = $2 WHERE id = $3`,
      [functionName, JSON.stringify(params), txLogId]
    );
  }

  async _logSapResponse(txLogId, response) {
    await query(
      `UPDATE transaction_logs SET sap_response = $1 WHERE id = $2`,
      [JSON.stringify(response), txLogId]
    );
  }

  async _completeTransactionLog(txLogId, status) {
    await query(
      `UPDATE transaction_logs
       SET status = $1, completed_at = now(),
           duration_ms = EXTRACT(EPOCH FROM (now() - started_at)) * 1000
       WHERE id = $2`,
      [status, txLogId]
    );
  }

  async _failTransactionLog(txLogId, error) {
    await query(
      `UPDATE transaction_logs
       SET status = 'FAILED', error_message = $1, error_code = $2,
           completed_at = now(),
           duration_ms = EXTRACT(EPOCH FROM (now() - started_at)) * 1000,
           is_editable = true
       WHERE id = $3`,
      [error.message, error.code || 'UNKNOWN', txLogId]
    );
  }

  // ─────────────────────────────────────────────
  // UTILITY: Check BAPI Return for errors
  // ─────────────────────────────────────────────
  _checkBapiReturn(returnTable, bapiName) {
    if (!returnTable) return;

    const errors = (Array.isArray(returnTable) ? returnTable : [returnTable])
      .filter((r) => r.TYPE === 'E' || r.TYPE === 'A');

    if (errors.length > 0) {
      const messages = errors.map((e) => `[${e.NUMBER || ''}] ${e.MESSAGE}`).join('; ');
      const err = new Error(`${bapiName} failed: ${messages}`);
      err.code = 'SAP_BAPI_ERROR';
      err.sapErrors = errors;
      throw err;
    }
  }
}

module.exports = new DeliveryExecutionService();
