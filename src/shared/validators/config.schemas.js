/**
 * Configuration Route Zod Schemas
 */
const { z } = require('zod');

const CreateWarehouseSchema = z.object({
  warehouse_code: z.string().min(1).max(20),
  warehouse_name: z.string().min(1).max(100),
  plant_code: z.string().min(1).max(10),
  company_code: z.string().max(20).optional(),
  company_name: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  is_active: z.boolean().optional()
}).passthrough();

const UpdateWarehouseSchema = CreateWarehouseSchema.partial();

const CreateMappingSchema = z.object({
  name: z.string().min(1).max(100),
  delivery_type: z.string().max(10).optional(),
  direction: z.enum(['INBOUND', 'OUTBOUND', 'BOTH']).optional(),
  mvt_type: z.string().max(10).optional(),
  gm_code: z.string().max(5).optional(),
  is_active: z.boolean().optional()
}).passthrough();

const UpdateMappingSchema = CreateMappingSchema.partial();

const CreateProcessConfigSchema = z.object({
  plant_code: z.string().min(1).max(10),
  warehouse_code: z.string().min(1).max(20),
  delivery_type: z.string().min(1).max(10),
  delivery_type_desc: z.string().max(100).optional(),
  process_type: z.string().min(1).max(30),
  mvt_type: z.string().max(10).optional(),
  gm_code: z.string().max(5).optional(),
  company_name: z.string().max(100).optional(),
  company_code: z.string().max(20).optional(),
  api_base_url: z.string().url().max(500).or(z.literal('')).optional(),
  bapi_name: z.string().max(50).optional()
}).passthrough();

const UpdateProcessConfigSchema = CreateProcessConfigSchema.partial();

const CreateProcessTypeSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  steps: z.array(z.object({
    step_no: z.number().int().min(1),
    name: z.string().min(1),
    source: z.string().optional(),
    target: z.string().optional(),
    direction: z.string().optional(),
    api: z.string().optional()
  })).optional(),
  is_active: z.boolean().optional()
}).passthrough();

const UpdateProcessTypeSchema = CreateProcessTypeSchema.partial();

const CreateFieldMappingSchema = z.object({
  name: z.string().min(1).max(100),
  process_type: z.string().max(30).optional(),
  company_code: z.string().max(20).optional(),
  category: z.string().max(30).optional(),
  api_endpoint: z.string().max(500).optional(),
  http_method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  security_profile_id: z.string().uuid().nullable().optional(),
  field_rules: z.array(z.object({
    source: z.string().optional(),
    target: z.string().optional(),
    type: z.string().optional(),
    value: z.any().optional()
  })).optional(),
  headers: z.array(z.object({
    key: z.string(),
    value: z.string()
  })).optional(),
  timeout_ms: z.number().int().min(100).max(300000).optional(),
  is_active: z.boolean().optional()
}).passthrough();

const UpdateFieldMappingSchema = CreateFieldMappingSchema.partial();

const CreateSecurityProfileSchema = z.object({
  name: z.string().min(1).max(100),
  auth_type: z.enum(['NONE', 'BASIC', 'BEARER', 'API_KEY', 'OAUTH2', 'CERTIFICATE']),
  company_code: z.string().max(20).optional(),
  config: z.record(z.any()).optional(),
  is_active: z.boolean().optional()
}).passthrough();

const UpdateSecurityProfileSchema = CreateSecurityProfileSchema.partial();

const TestDispatchSchema = z.object({
  url: z.string().url('Gecerli bir URL olmali'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  headers: z.array(z.object({
    key: z.string(),
    value: z.string()
  })).optional(),
  securityProfileId: z.string().uuid().nullable().optional(),
  body: z.any().optional(),
  responseRules: z.array(z.any()).optional()
});

const EmailTestSchema = z.object({
  to: z.string().email('Gecerli bir e-posta adresi gerekli')
});

const ApplyTemplateSchema = z.object({
  tenant_id: z.string().uuid('Gecerli bir tenant_id gerekli'),
  provider_code: z.string().min(1, 'provider_code zorunlu'),
  sub_services: z.array(z.string()).optional()
});

module.exports = {
  CreateWarehouseSchema,
  UpdateWarehouseSchema,
  CreateMappingSchema,
  UpdateMappingSchema,
  CreateProcessConfigSchema,
  UpdateProcessConfigSchema,
  CreateProcessTypeSchema,
  UpdateProcessTypeSchema,
  CreateFieldMappingSchema,
  UpdateFieldMappingSchema,
  CreateSecurityProfileSchema,
  UpdateSecurityProfileSchema,
  TestDispatchSchema,
  EmailTestSchema,
  ApplyTemplateSchema
};
