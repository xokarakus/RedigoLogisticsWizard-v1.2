-- Secret Rotation Log
-- Secret rotation gecmisini ve aktif degerleri tutar.
-- new_value: sifrelenmis deger (production'da BTP CredStore'dan okunur, DB'de yedek)
-- old_value_hash: onceki degerin SHA-256 hash'inin ilk 16 karakteri (audit trail)

CREATE TABLE IF NOT EXISTS secret_rotation_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_name   VARCHAR(100) NOT NULL,
  old_value_hash VARCHAR(16),
  new_value     TEXT NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, ROTATED, REVOKED
  rotated_by    VARCHAR(100) NOT NULL DEFAULT 'system',
  reason        VARCHAR(255),
  rotated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Son aktif secret'i hizli bulmak icin
CREATE INDEX IF NOT EXISTS idx_secret_rotation_active
  ON secret_rotation_log (secret_name, status)
  WHERE status = 'ACTIVE';

-- Gecmis sorgusu icin
CREATE INDEX IF NOT EXISTS idx_secret_rotation_history
  ON secret_rotation_log (secret_name, rotated_at DESC);

-- 180 gun onceki ROTATED kayitlarini temizle (new_value = masked)
CREATE OR REPLACE FUNCTION cleanup_secret_rotation_log()
RETURNS void AS $$
BEGIN
  UPDATE secret_rotation_log
  SET new_value = '***ROTATED***'
  WHERE status = 'ROTATED'
    AND rotated_at < NOW() - INTERVAL '180 days'
    AND new_value != '***ROTATED***';
END;
$$ LANGUAGE plpgsql;
