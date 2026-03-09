-- =============================================
-- Migration 009: Enhanced Multi-Tenant + Audit
-- RBAC 3-rol: SUPER_ADMIN, TENANT_ADMIN, TENANT_USER
-- Domain kısıtlaması, impersonation, audit trail
-- =============================================

-- ── 1. Tenants tablosuna şirket detay alanları ──
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS title         VARCHAR(300);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address       TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_info     JSONB DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_info  JSONB DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_person VARCHAR(200);

-- ── 2. Users tablosuna email + is_super_admin + password reset ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS email                  VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token   VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- ── 3. Rol göçü: ADMIN → TENANT_ADMIN, OPERATOR/VIEWER → TENANT_USER ──
UPDATE users SET role = 'TENANT_ADMIN' WHERE role = 'ADMIN';
UPDATE users SET role = 'TENANT_USER'  WHERE role IN ('OPERATOR', 'VIEWER');
-- SUPER_ADMIN olarak kalan kullanıcıya is_super_admin flag'i ata
UPDATE users SET is_super_admin = true WHERE role = 'SUPER_ADMIN';
-- SUPER_ADMIN'lere @redigodigital.com email ata (mevcut yoksa)
UPDATE users SET email = username || '@redigodigital.com' WHERE role = 'SUPER_ADMIN' AND email IS NULL;

-- ── 4. Audit Logs tablosu ──
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants(id),
  user_id      UUID REFERENCES users(id),
  username     VARCHAR(100),
  entity_type  VARCHAR(100) NOT NULL,
  entity_id    TEXT,
  action       VARCHAR(50) NOT NULL,
  old_values   JSONB,
  new_values   JSONB,
  ip_address   VARCHAR(45),
  user_agent   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant    ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity    ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user      ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_logs(created_at);

-- ── 5. Config tablolarına tenant_id (henüz yoksa) ──
ALTER TABLE warehouses         ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE process_configs    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE process_types      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE field_mappings     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE security_profiles  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE movement_mappings  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Mevcut config kayıtlarını REDIGO tenant'ına ata
UPDATE warehouses        SET tenant_id = (SELECT id FROM tenants WHERE code = 'REDIGO') WHERE tenant_id IS NULL;
UPDATE process_configs   SET tenant_id = (SELECT id FROM tenants WHERE code = 'REDIGO') WHERE tenant_id IS NULL;
UPDATE process_types     SET tenant_id = (SELECT id FROM tenants WHERE code = 'REDIGO') WHERE tenant_id IS NULL;
UPDATE field_mappings    SET tenant_id = (SELECT id FROM tenants WHERE code = 'REDIGO') WHERE tenant_id IS NULL;
UPDATE security_profiles SET tenant_id = (SELECT id FROM tenants WHERE code = 'REDIGO') WHERE tenant_id IS NULL;
UPDATE movement_mappings SET tenant_id = (SELECT id FROM tenants WHERE code = 'REDIGO') WHERE tenant_id IS NULL;

-- ── 6. Tema ayarı için system_settings tablosu ──
CREATE TABLE IF NOT EXISTS system_settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id),
  key        VARCHAR(100) NOT NULL,
  value      JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, key)
);
