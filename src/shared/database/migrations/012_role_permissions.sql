-- ══════════════════════════════════════════════════════════
-- 012: Role-based Permissions (Rol Bazli Yetkilendirme)
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS role_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  role       VARCHAR(30) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, role)
);

-- Her tenant icin varsayilan roller + yetkiler
-- Bu INSERT'ler sadece kayit yoksa calisir (ON CONFLICT DO NOTHING)
-- Gercek seed islemini uygulama yapacak
