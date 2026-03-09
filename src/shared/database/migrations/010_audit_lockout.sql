-- =============================================
-- Migration 010: Account Lockout + Enhanced Audit
-- Hesap kilitleme, zorunlu sifre degistirme,
-- audit log severity + detail alanlari
-- =============================================

-- ── 1. Users tablosuna hesap kilitleme alanlari ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Audit logs tablosuna severity + detail ──
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'INFO';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS detail TEXT;

-- ── 3. Severity index (filtreleme icin) ──
CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_logs(severity);
