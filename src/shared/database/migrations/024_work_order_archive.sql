-- ══════════════════════════════════════════════════════════
-- 024: Work Order Archive — Arsivleme icin archived_at kolonu
-- ══════════════════════════════════════════════════════════

-- archived_at: PGI/GR sonrasi set edilir, is emirlerini arsive tasir
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- Mevcut kapali emirleri de arsivle (PGI_POSTED, GR_POSTED, COMPLETED, CANCELLED)
UPDATE work_orders SET archived_at = COALESCE(completed_at, sap_posted_at, NOW())
WHERE status IN ('PGI_POSTED', 'GR_POSTED', 'COMPLETED', 'CANCELLED') AND archived_at IS NULL;

-- Arsiv sorgulari icin index
CREATE INDEX IF NOT EXISTS idx_wo_archived_at ON work_orders(archived_at) WHERE archived_at IS NOT NULL;

-- Aktif is emirleri icin partial index (archived_at IS NULL = aktif)
CREATE INDEX IF NOT EXISTS idx_wo_active ON work_orders(tenant_id, status) WHERE archived_at IS NULL;
