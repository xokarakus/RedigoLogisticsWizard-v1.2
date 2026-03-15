-- ══════════════════════════════════════════════════════════
-- 023: Audit Log Retention — Eski kayitlari temizleme
-- ══════════════════════════════════════════════════════════

-- system_settings tablosuna default retention suresi ekle
-- Her tenant kendi retention_days degerini ayarlayabilir
-- Varsayilan: 90 gun

-- Cleanup fonksiyonu: belirli gun sayisindan eski audit loglarini siler
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audit_logs
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Eski refresh token'lari temizle (suresi dolmus olanlar)
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM refresh_tokens
  WHERE expires_at < NOW() OR revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Eski job execution kayitlarini temizle (180 gun)
CREATE OR REPLACE FUNCTION cleanup_old_job_executions(retention_days INTEGER DEFAULT 180)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Once items'lari sil
  DELETE FROM job_execution_items
  WHERE execution_id IN (
    SELECT id FROM job_executions
    WHERE started_at < NOW() - (retention_days || ' days')::INTERVAL
  );

  -- Sonra execution'lari sil
  DELETE FROM job_executions
  WHERE started_at < NOW() - (retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
