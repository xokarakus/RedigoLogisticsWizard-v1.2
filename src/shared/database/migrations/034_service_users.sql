-- 034: Service Users (Servis Kullanıcıları)
-- API key + secret ile kimlik doğrulama yapan makine/entegrasyon kullanıcıları
-- Her tenant için max 5 adet, usage_count > 0 ise silinemez (Iron Rule)

CREATE TABLE IF NOT EXISTS service_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name            VARCHAR(100) NOT NULL,
  description     VARCHAR(500),
  api_key         VARCHAR(255) NOT NULL UNIQUE,
  api_key_hash    VARCHAR(255) NOT NULL,
  api_secret_hash VARCHAR(255) NOT NULL,
  scopes          JSONB NOT NULL DEFAULT '["read","write"]',
  usage_count     BIGINT NOT NULL DEFAULT 0,
  last_used_at    TIMESTAMPTZ,
  last_used_ip    VARCHAR(45),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  expires_at      TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_users_tenant ON service_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_users_api_key ON service_users(api_key);
CREATE INDEX IF NOT EXISTS idx_service_users_active ON service_users(tenant_id, is_active);

-- Iron Rule: usage_count > 0 ise DELETE engelle
CREATE OR REPLACE FUNCTION prevent_used_service_user_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.usage_count > 0 THEN
    RAISE EXCEPTION 'DELETE not allowed on service_users with usage_count > 0. Use is_active = false to deactivate.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_users_no_delete ON service_users;
CREATE TRIGGER trg_service_users_no_delete
  BEFORE DELETE ON service_users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_used_service_user_delete();

-- Max 5 per tenant constraint
CREATE OR REPLACE FUNCTION check_service_user_limit()
RETURNS TRIGGER AS $$
DECLARE
  cnt INT;
BEGIN
  SELECT COUNT(*) INTO cnt FROM service_users WHERE tenant_id = NEW.tenant_id;
  IF cnt >= 5 THEN
    RAISE EXCEPTION 'Maximum 5 service users per tenant reached';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_users_limit ON service_users;
CREATE TRIGGER trg_service_users_limit
  BEFORE INSERT ON service_users
  FOR EACH ROW
  EXECUTE FUNCTION check_service_user_limit();
