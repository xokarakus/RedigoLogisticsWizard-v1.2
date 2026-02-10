const { z } = require('zod');

const WmsLineConfirmationSchema = z.object({
  sap_item_no: z.string().min(1).max(6),
  material: z.string().min(1).max(18),
  picked_qty: z.number().min(0),
  uom: z.string().max(10).optional(),
  batch: z.string().max(10).optional(),
  serial_numbers: z.array(z.string()).optional().default([]),
  hu_ids: z.array(z.string()).optional().default([]),
  is_final: z.boolean().optional().default(false),
});

const WmsConfirmationSchema = z.object({
  wms_order_id: z.string().min(1),
  warehouse_code: z.string().min(1),
  delivery_no: z.string().min(1).max(10),
  status: z.enum(['PARTIAL', 'COMPLETE', 'CANCELLED']),
  lines: z.array(WmsLineConfirmationSchema).min(1),
  timestamp: z.string().datetime().optional(),
});

module.exports = { WmsConfirmationSchema, WmsLineConfirmationSchema };
