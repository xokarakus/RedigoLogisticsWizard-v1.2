-- ============================================================
-- 007: field_mappings tablosuna category kolonu ekle
-- WORK_ORDER: gelen veri is emri surecine duser
-- MASTER_DATA: gelen veri direkt 3PL'e dispatch edilir
-- ============================================================

ALTER TABLE field_mappings
  ADD COLUMN IF NOT EXISTS category VARCHAR(20) NOT NULL DEFAULT 'WORK_ORDER';
