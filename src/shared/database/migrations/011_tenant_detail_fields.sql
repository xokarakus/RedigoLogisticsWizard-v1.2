-- =============================================
-- Migration 011: Tenant Detail Fields
-- Domain, vergi bilgileri, IBAN, telefon, plan
-- =============================================

-- Yeni alanlar
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS domain      VARCHAR(200);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_id      VARCHAR(20);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_office  VARCHAR(200);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS iban        VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone       VARCHAR(30);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan        VARCHAR(30) NOT NULL DEFAULT 'standard';

-- is_system_tenant: ilk (setup) tenant'ını işaretler
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_system_tenant BOOLEAN NOT NULL DEFAULT false;

-- REDIGO tenant'ını sistem tenant'ı olarak işaretle
UPDATE tenants SET is_system_tenant = true WHERE code = 'REDIGO';
