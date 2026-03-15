-- 026: Feature Flags tablosu
-- Tenant bazli feature toggle sistemi

CREATE TABLE IF NOT EXISTS feature_flags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),
  flag_key      VARCHAR(100) NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT false,
  description   VARCHAR(500),
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, flag_key)
);

-- Global (tenant_id NULL) flagler icin unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_ff_global_key ON feature_flags(flag_key) WHERE tenant_id IS NULL;

-- Varsayilan global feature flag'ler
INSERT INTO feature_flags (tenant_id, flag_key, enabled, description) VALUES
  (NULL, 'bulk_operations', true, 'Toplu islem API erisimine izin ver'),
  (NULL, 'gdpr_export', true, 'GDPR veri disari aktarma'),
  (NULL, 'circuit_breaker', true, 'SAP/3PL circuit breaker aktif'),
  (NULL, 'webhook_hmac', true, 'Webhook HMAC imza dogrulamasi'),
  (NULL, 'archive_auto', true, 'Otomatik arsivleme (PGI/GR sonrasi)'),
  (NULL, 'canary_deploy', false, 'Canary deployment modu')
ON CONFLICT DO NOTHING;
