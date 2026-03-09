-- =============================================
-- Migration 008: Multi-Tenant + Users + RBAC
-- =============================================

-- ── 1. Tenant tablosu ──
CREATE TABLE IF NOT EXISTS tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       VARCHAR(20) NOT NULL UNIQUE,
  name       VARCHAR(200) NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  config     JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 2. Users tablosu ──
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  username       VARCHAR(100) NOT NULL UNIQUE,
  password_hash  VARCHAR(200) NOT NULL,
  display_name   VARCHAR(200),
  role           VARCHAR(20) NOT NULL DEFAULT 'VIEWER',
  is_active      BOOLEAN NOT NULL DEFAULT true,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ── 3. Mevcut tablolara tenant_id ekle ──
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE transaction_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE reconciliation_reports ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

CREATE INDEX IF NOT EXISTS idx_wo_tenant ON work_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tl_tenant ON transaction_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jq_tenant ON job_queue(tenant_id);

-- ── 4. Seed: Mevcut company_code'lardan tenant oluştur ──
INSERT INTO tenants (code, name) VALUES
  ('REDIGO', 'Redigo Sistem'),
  ('ABC_LOG', 'ABC Lojistik A.Ş.'),
  ('XYZ_DEPO', 'XYZ Depo A.Ş.'),
  ('HOROZ', 'Horoz Lojistik')
ON CONFLICT (code) DO NOTHING;

-- ── 5. Seed: Super admin kullanıcı (şifre: admin123) ──
INSERT INTO users (tenant_id, username, password_hash, display_name, role)
SELECT id, 'admin', '$2b$10$03X6JOcGinlsQHx4y/JCcO2Xzls9tNGo5TFXYIA1Oklq..7GHYf3q', 'Sistem Yöneticisi', 'SUPER_ADMIN'
FROM tenants WHERE code = 'REDIGO'
ON CONFLICT (username) DO NOTHING;

-- ── 6. Veri göçü: work_orders.tenant_id ← warehouse_code → warehouses.company_code → tenants ──
UPDATE work_orders wo
SET tenant_id = t.id
FROM warehouses w, tenants t
WHERE wo.warehouse_code = w.code
  AND w.company_code = t.code
  AND wo.tenant_id IS NULL;

-- Eşleşmeyen kayıtlar → REDIGO tenant'ına ata
UPDATE work_orders
SET tenant_id = (SELECT id FROM tenants WHERE code = 'REDIGO')
WHERE tenant_id IS NULL;

-- ── 7. Veri göçü: transaction_logs.tenant_id ← work_orders.correlation_id ──
UPDATE transaction_logs tl
SET tenant_id = wo.tenant_id
FROM work_orders wo
WHERE tl.correlation_id IS NOT NULL
  AND tl.correlation_id = wo.correlation_id::text
  AND tl.tenant_id IS NULL
  AND wo.tenant_id IS NOT NULL;

-- Kalanlar → REDIGO
UPDATE transaction_logs
SET tenant_id = (SELECT id FROM tenants WHERE code = 'REDIGO')
WHERE tenant_id IS NULL;

-- ── 8. Veri göçü: job_queue → REDIGO ──
UPDATE job_queue
SET tenant_id = (SELECT id FROM tenants WHERE code = 'REDIGO')
WHERE tenant_id IS NULL;

-- ── 9. Veri göçü: reconciliation_reports → REDIGO ──
UPDATE reconciliation_reports
SET tenant_id = (SELECT id FROM tenants WHERE code = 'REDIGO')
WHERE tenant_id IS NULL;
