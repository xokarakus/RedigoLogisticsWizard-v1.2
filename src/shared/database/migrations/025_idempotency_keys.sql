-- 025: Idempotency Keys tablosu
-- Ayni istegin tekrar islenmesini engellemek icin cache

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key     VARCHAR(500) UNIQUE NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  tenant_id     UUID REFERENCES tenants(id),
  method        VARCHAR(10) NOT NULL,
  path          VARCHAR(500) NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- TTL icin index (cleanup job'u hizlandirir)
CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);

-- Eski kayitlari temizlemek icin fonksiyon
CREATE OR REPLACE FUNCTION cleanup_idempotency_keys(retention_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM idempotency_keys
  WHERE created_at < NOW() - (retention_hours || ' hours')::INTERVAL;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$ LANGUAGE plpgsql;
