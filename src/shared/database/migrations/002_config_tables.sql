-- ============================================================
-- RedigoLogisticsWizard v1.2 - Config Tables
-- Process configs, types, field mappings, security profiles
-- ============================================================
-- IRON RULE: No config row used in a transaction can be deleted.
--            ON DELETE RESTRICT everywhere. Archive via is_active = false.
-- ============================================================

BEGIN;

-- ===================
-- PROCESS TYPES
-- ===================
CREATE TABLE process_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  steps       JSONB NOT NULL DEFAULT '[]',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================
-- PROCESS CONFIGS
-- ===================
CREATE TABLE process_configs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_code         VARCHAR(10) NOT NULL,
  warehouse_code     VARCHAR(20) NOT NULL,
  delivery_type      VARCHAR(10) NOT NULL,
  delivery_type_desc VARCHAR(100),
  process_type       VARCHAR(20) NOT NULL,
  mvt_type           VARCHAR(10),
  company_name       VARCHAR(100),
  company_code       VARCHAR(20),
  api_base_url       VARCHAR(500),
  bapi_name          VARCHAR(100),
  gm_code            VARCHAR(10),
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plant_code, warehouse_code, delivery_type)
);

-- ===================
-- FIELD MAPPINGS
-- ===================
CREATE TABLE field_mappings (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_type                 VARCHAR(20),
  company_code                 VARCHAR(20),
  description                  VARCHAR(200),
  direction                    VARCHAR(20),
  source_api_endpoint          VARCHAR(500),
  api_endpoint                 VARCHAR(500),
  http_method                  VARCHAR(10) DEFAULT 'POST',
  headers                      JSONB DEFAULT '[]',
  security_profile_id          TEXT,
  sap_sample_json              JSONB DEFAULT '{}',
  threepl_sample_json          JSONB DEFAULT '{}',
  threepl_response_sample_json JSONB DEFAULT '{}',
  field_rules                  JSONB DEFAULT '[]',
  response_rules               JSONB DEFAULT '[]',
  is_active                    BOOLEAN NOT NULL DEFAULT true,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================
-- SECURITY PROFILES
-- ===================
CREATE TABLE security_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100),
  company_code  VARCHAR(20),
  auth_type     VARCHAR(20) NOT NULL,
  environment   VARCHAR(20) DEFAULT 'PRODUCTION',
  config        JSONB NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================
-- SAP FIELD ALIASES (reference dictionary — single row)
-- ===================
CREATE TABLE sap_field_aliases (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  aliases    JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO sap_field_aliases (aliases) VALUES ('{}');

-- ===================
-- UPDATED_AT TRIGGERS
-- ===================
CREATE TRIGGER trg_process_types_updated
  BEFORE UPDATE ON process_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_process_configs_updated
  BEFORE UPDATE ON process_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_field_mappings_updated
  BEFORE UPDATE ON field_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_security_profiles_updated
  BEFORE UPDATE ON security_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sap_field_aliases_updated
  BEFORE UPDATE ON sap_field_aliases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===================
-- ANTI-DELETE TRIGGERS (Iron Rule)
-- ===================
CREATE TRIGGER trg_no_delete_process_types
  BEFORE DELETE ON process_types
  FOR EACH ROW EXECUTE FUNCTION prevent_config_delete();

CREATE TRIGGER trg_no_delete_process_configs
  BEFORE DELETE ON process_configs
  FOR EACH ROW EXECUTE FUNCTION prevent_config_delete();

CREATE TRIGGER trg_no_delete_field_mappings
  BEFORE DELETE ON field_mappings
  FOR EACH ROW EXECUTE FUNCTION prevent_config_delete();

CREATE TRIGGER trg_no_delete_security_profiles
  BEFORE DELETE ON security_profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_config_delete();

COMMIT;
