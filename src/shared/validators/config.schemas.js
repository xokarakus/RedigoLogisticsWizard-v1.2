/**
 * Configuration Route Zod Schemas
 */
const { z } = require('zod');

const CreateWarehouseSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  sap_plant: z.string().min(1).max(10),
  sap_stor_loc: z.string().max(10).optional(),
  wms_code: z.string().max(20).optional(),
  company_code: z.string().max(20).optional(),
  company_name: z.string().max(100).optional(),
  sap_partner_no: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  is_active: z.boolean().optional()
}).passthrough();

const UpdateWarehouseSchema = CreateWarehouseSchema.partial();

const CreateFieldMappingSchema = z.object({
  name: z.string().max(100).optional(),
  process_type: z.string().max(30).optional(),
  warehouse_id: z.string().uuid().nullable().optional(),
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
  environment: z.enum(['PROD', 'QAS', 'DEV']).optional(),
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
  to: z.string().email('Valid email address required')
});

const ApplyTemplateSchema = z.object({
  tenant_id: z.string().uuid('Valid tenant_id required').optional(),
  provider_code: z.string().min(1, 'provider_code zorunlu'),
  sub_services: z.array(z.string()).optional()
});

const CreateProviderTemplateSchema = z.object({
  code: z.string().min(1, 'code zorunlu').max(30),
  name: z.string().min(1, 'name zorunlu').max(100),
  description: z.string().max(500).nullish(),
  auth_type: z.string().max(20).nullish(),
  sub_services: z.array(z.object({
    code: z.string().min(1),
    name: z.string().min(1)
  })).nullish(),
  template_data: z.record(z.any()).optional(),
  is_active: z.boolean().optional()
}).passthrough();

const UpdateProviderTemplateSchema = CreateProviderTemplateSchema.partial();

const ExportTenantTemplateSchema = z.object({
  tenant_id: z.string().uuid('Valid tenant_id required').optional(),
  code: z.string().min(1, 'code zorunlu').max(30),
  name: z.string().min(1, 'name zorunlu').max(100),
  description: z.string().max(500).nullish()
});

const CreateServiceUserSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  scopes: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  expires_at: z.string().nullable().optional()
});

const UpdateServiceUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  scopes: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  expires_at: z.string().nullable().optional()
});

module.exports = {
  CreateWarehouseSchema,
  UpdateWarehouseSchema,
  CreateFieldMappingSchema,
  UpdateFieldMappingSchema,
  CreateSecurityProfileSchema,
  UpdateSecurityProfileSchema,
  TestDispatchSchema,
  EmailTestSchema,
  ApplyTemplateSchema,
  CreateProviderTemplateSchema,
  UpdateProviderTemplateSchema,
  ExportTenantTemplateSchema,
  CreateServiceUserSchema,
  UpdateServiceUserSchema
};
