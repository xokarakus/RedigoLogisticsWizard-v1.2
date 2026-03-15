/**
 * Ortak Zod Sema Parcalari
 * Tum route'larda tekrar eden alanlar burada tanimlanir.
 */
const { z } = require('zod');

// UUID format
const uuid = z.string().uuid('Gecerli bir UUID olmali');

// Pagination query params — string'den number'a donusturur
const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0)
}).passthrough();

// Tarih filtreli pagination
const dateFilterQuery = paginationQuery.extend({
  date_from: z.string().refine(v => !isNaN(Date.parse(v)), { message: 'Gecerli bir tarih olmali (ISO-8601)' }).optional(),
  date_to: z.string().refine(v => !isNaN(Date.parse(v)), { message: 'Gecerli bir tarih olmali (ISO-8601)' }).optional()
});

// ID params
const idParam = z.object({
  id: uuid
});

// Delivery no — SAP teslimat numarasi (max 10 hane)
const deliveryNo = z.string().min(1, 'delivery_no zorunludur').max(20);

// Ortak delivery body
const deliveryBody = z.object({
  delivery_no: deliveryNo,
  plant_code: z.string().max(10).optional(),
  warehouse_code: z.string().max(20).optional(),
  delivery_type: z.string().max(10).optional()
});

module.exports = {
  uuid,
  paginationQuery,
  dateFilterQuery,
  idParam,
  deliveryNo,
  deliveryBody
};
