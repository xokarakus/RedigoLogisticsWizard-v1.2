-- Provider Templates: Lojistik sağlayıcı şablonlarını DB'de sakla
-- Mevcut JSON seed dosyaları fallback olarak korunur

CREATE TABLE IF NOT EXISTS provider_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(30)  NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  description   TEXT,
  auth_type     VARCHAR(20),
  sub_services  JSONB,
  template_data JSONB        NOT NULL DEFAULT '{}',
  is_active     BOOLEAN      DEFAULT true,
  created_by    UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  DEFAULT now(),
  updated_at    TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_templates_code ON provider_templates(code);
CREATE INDEX IF NOT EXISTS idx_provider_templates_active ON provider_templates(is_active) WHERE is_active = true;
