-- ══════════════════════════════════════════════════════════
-- 013: Custom Roles (Ozel Roller)
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  code        VARCHAR(50) NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  is_system   BOOLEAN DEFAULT false,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, code)
);

-- Sistem rolleri icin tenant bazli seed (her tenant icin 3 sistem rolu)
INSERT INTO roles (tenant_id, code, name, description, is_system, permissions)
SELECT t.id, r.code, r.name, r.description, true, r.perms::jsonb
FROM tenants t
CROSS JOIN (VALUES
  ('SUPER_ADMIN', 'Super Admin', 'Tam yetkili sistem yoneticisi. Yetkileri degistirilemez.', '{"dashboard.view":true,"work_orders.view":true,"work_orders.process":true,"inventory.view":true,"reconciliation.view":true,"reconciliation.run":true,"config.view":true,"config.edit":true,"users.view":true,"users.manage":true,"audit.view":true,"tenants.manage":true}'),
  ('TENANT_ADMIN', 'Sirket Yoneticisi', 'Sirket yonetim yetkilerine sahip. Kullanici ve yetki yonetimi her zaman aciktir.', '{"dashboard.view":true,"work_orders.view":true,"work_orders.process":true,"inventory.view":true,"reconciliation.view":true,"reconciliation.run":true,"config.view":true,"config.edit":true,"users.view":true,"users.manage":true,"audit.view":true,"tenants.manage":false}'),
  ('TENANT_USER', 'Kullanici', 'Standart kullanici. Yetkileri yonetici tarafindan belirlenir.', '{"dashboard.view":true,"work_orders.view":true,"work_orders.process":false,"inventory.view":true,"reconciliation.view":true,"reconciliation.run":false,"config.view":false,"config.edit":false,"users.view":false,"users.manage":false,"audit.view":false,"tenants.manage":false}')
) AS r(code, name, description, perms)
ON CONFLICT (tenant_id, code) DO NOTHING;
