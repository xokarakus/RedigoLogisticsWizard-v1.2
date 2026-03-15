/**
 * Work Order & Trigger Route Zod Schemas
 */
const { z } = require('zod');
const { deliveryBody } = require('./common');

// Work order list query
const WorkOrderListQuery = z.object({
  status: z.string().max(30).optional(),
  type: z.string().max(30).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  date_from: z.string().refine(v => !isNaN(Date.parse(v)), { message: 'Gecerli bir tarih olmali' }).optional(),
  date_to: z.string().refine(v => !isNaN(Date.parse(v)), { message: 'Gecerli bir tarih olmali' }).optional()
}).passthrough();

// Work order detail query (kalem sayfalama)
const WorkOrderDetailQuery = z.object({
  lines_skip: z.coerce.number().int().min(0).default(0),
  lines_top: z.coerce.number().int().min(1).max(500).default(100)
}).passthrough();

// Work order update — sadece izin verilen alanlar
const UpdateWorkOrderSchema = z.object({
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  notes: z.string().max(2000).optional(),
  status: z.string().max(30).optional()
});

// Work order ingest (SAP delivery)
const IngestWorkOrderSchema = z.object({
  sap_delivery_no: z.string().min(1, 'sap_delivery_no zorunlu').max(20),
  sap_delivery_type: z.string().max(10).optional(),
  sap_doc_date: z.string().optional(),
  sap_ship_to: z.string().max(20).optional(),
  order_type: z.string().max(30).optional(),
  warehouse_code: z.string().max(20).optional(),
  plant_code: z.string().max(10).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  lines: z.array(z.object({
    sap_item_no: z.string().optional(),
    sap_material: z.string().optional(),
    sap_material_desc: z.string().optional(),
    sap_requested_qty: z.number().min(0).optional(),
    sap_uom: z.string().optional(),
    sap_batch: z.string().optional()
  }).passthrough()).optional()
}).passthrough();

// Goods movement body (PGI / GR)
const GoodsMovementSchema = deliveryBody.extend({
  mvt_type: z.string().max(10).optional()
});

// Transaction list query
const TransactionListQuery = z.object({
  status: z.string().max(30).optional(),
  work_order_id: z.string().uuid().optional(),
  action_like: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  date_from: z.string().refine(v => !isNaN(Date.parse(v)), { message: 'Gecerli bir tarih olmali' }).optional(),
  date_to: z.string().refine(v => !isNaN(Date.parse(v)), { message: 'Gecerli bir tarih olmali' }).optional()
}).passthrough();

// DB Cockpit query
const DbCockpitQuerySchema = z.object({
  sql: z.string().min(1, 'SQL sorgusu zorunlu').max(10000)
});

module.exports = {
  WorkOrderListQuery,
  WorkOrderDetailQuery,
  UpdateWorkOrderSchema,
  IngestWorkOrderSchema,
  GoodsMovementSchema,
  TransactionListQuery,
  DbCockpitQuerySchema
};
