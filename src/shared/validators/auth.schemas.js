/**
 * Auth Route Zod Schemas
 */
const { z } = require('zod');

// Sifre kurallari: min 8 karakter, en az 1 buyuk harf, 1 kucuk harf, 1 rakam
const passwordRule = z.string()
  .min(8, 'Sifre en az 8 karakter olmali')
  .max(128, 'Sifre en fazla 128 karakter olmali')
  .regex(/[A-Z]/, 'En az 1 buyuk harf icermeli')
  .regex(/[a-z]/, 'En az 1 kucuk harf icermeli')
  .regex(/[0-9]/, 'En az 1 rakam icermeli');

const SetupSchema = z.object({
  email: z.string().email('Gecerli bir e-posta adresi girin'),
  password: passwordRule,
  display_name: z.string().min(1).max(100),
  company_name: z.string().min(1).max(100),
  company_code: z.string().min(1).max(20).optional()
});

const LoginSchema = z.object({
  email: z.string().email('Gecerli bir e-posta adresi girin'),
  password: z.string().min(1, 'Sifre zorunlu')
});

const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken zorunlu')
});

const ChangePasswordSchema = z.object({
  current_password: z.string().optional(),
  new_password: passwordRule,
  force_change: z.boolean().optional()
});

const ForgotPasswordSchema = z.object({
  email: z.string().email('Gecerli bir e-posta adresi giriniz')
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token zorunlu'),
  new_password: passwordRule
});

const SendResetSchema = z.object({
  user_id: z.string().uuid(),
  email: z.string().email().optional()
});

const ImpersonateSchema = z.object({
  tenant_id: z.string().uuid('Gecerli bir tenant_id gerekli')
});

const UnlockAccountSchema = z.object({
  user_id: z.string().uuid('Gecerli bir UUID olmali')
});

const CreateTenantSchema = z.object({
  code: z.string().min(1).max(20).optional(),
  name: z.string().min(1, 'Sirket adi zorunlu').max(100),
  domain: z.string().min(1, 'Domain zorunlu').max(100),
  title: z.string().max(200).optional(),
  tax_id: z.string().max(20).optional(),
  tax_office: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  iban: z.string().max(34).optional(),
  contact_person: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  plan: z.enum(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']).optional(),
  admin_user: z.object({
    email: z.string().email('Gecerli bir e-posta adresi girin'),
    password: passwordRule,
    display_name: z.string().min(1).max(100)
  }).optional()
});

const UpdateTenantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  title: z.string().max(200).optional(),
  domain: z.string().min(1).max(100).optional(),
  tax_id: z.string().max(20).optional(),
  tax_office: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  iban: z.string().max(34).optional(),
  contact_person: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  plan: z.enum(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']).optional(),
  is_active: z.boolean().optional()
});

const CreateUserSchema = z.object({
  email: z.string().email('Gecerli bir e-posta adresi girin'),
  password: passwordRule,
  display_name: z.string().min(1).max(100).optional(),
  role: z.enum(['TENANT_ADMIN', 'TENANT_USER']).optional(),
  tenant_id: z.string().uuid().optional(),
  is_super_admin: z.boolean().optional()
});

const UpdateUserSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  is_active: z.boolean().optional(),
  role: z.enum(['TENANT_ADMIN', 'TENANT_USER']).optional()
});

const CreateRoleSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  permissions: z.record(z.boolean()).optional()
});

const UpdateRoleSchema = z.object({
  code: z.string().min(1).max(30).optional(),
  name: z.string().min(1).max(100).optional(),
  permissions: z.record(z.boolean()).optional()
});

module.exports = {
  passwordRule,
  SetupSchema,
  LoginSchema,
  RefreshTokenSchema,
  ChangePasswordSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  SendResetSchema,
  ImpersonateSchema,
  UnlockAccountSchema,
  CreateTenantSchema,
  UpdateTenantSchema,
  CreateUserSchema,
  UpdateUserSchema,
  CreateRoleSchema,
  UpdateRoleSchema
};
