/**
 * Master Data Route Zod Schemas
 */
const { z } = require('zod');

const MaterialListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().max(100).optional()
}).passthrough();

const CreateMaterialSchema = z.object({
  sap_material_no: z.string().min(1, 'Malzeme numarasi zorunlu').max(18),
  description: z.string().max(200).optional(),
  material_group: z.string().max(20).optional(),
  base_uom: z.string().max(10).optional(),
  gross_weight: z.number().min(0).optional(),
  net_weight: z.number().min(0).optional(),
  weight_unit: z.string().max(5).optional(),
  volume: z.number().min(0).optional(),
  volume_unit: z.string().max(5).optional()
}).passthrough();

const UpdateMaterialSchema = CreateMaterialSchema.partial();

const PartnerListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().max(100).optional(),
  type: z.enum(['ALL', 'CUSTOMER', 'VENDOR']).optional()
}).passthrough();

const CreatePartnerSchema = z.object({
  sap_partner_no: z.string().min(1, 'Partner numarasi zorunlu').max(20),
  name: z.string().min(1, 'Partner adi zorunlu').max(200),
  partner_type: z.enum(['CUSTOMER', 'VENDOR']),
  city: z.string().max(100).optional(),
  country: z.string().max(5).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal(''))
}).passthrough();

const UpdatePartnerSchema = CreatePartnerSchema.partial();

const DispatchSchema = z.object({
  type: z.enum(['materials', 'partners'], { message: 'type: materials veya partners olmali' }),
  ids: z.array(z.string().uuid()).optional(),
  mapping_id: z.string().uuid('mapping_id zorunlu')
});

const SyncSAPSchema = z.object({
  material_no: z.string().max(18).optional(),
  partner_id: z.string().uuid().optional()
}).refine(data => data.material_no || data.partner_id, {
  message: 'material_no veya partner_id gerekli'
});

module.exports = {
  MaterialListQuery,
  CreateMaterialSchema,
  UpdateMaterialSchema,
  PartnerListQuery,
  CreatePartnerSchema,
  UpdatePartnerSchema,
  DispatchSchema,
  SyncSAPSchema
};
