-- ============================================================
-- RedigoLogisticsWizard v1.2 - Align Schema with Application Model
-- Mevcut JSON veri modeliyle uyumlu hale getir.
-- ENUM → VARCHAR, eksik kolonlar ekle, FK'ları esnet.
-- ============================================================

BEGIN;

-- ===================
-- WAREHOUSES — Eksik kolonlar
-- ===================
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS company_code VARCHAR(20);
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS sap_partner_no VARCHAR(20);
ALTER TABLE warehouses ALTER COLUMN wms_provider DROP NOT NULL;

-- ===================
-- WORK ORDERS — Eksik kolonlar ve tip değişiklikleri
-- ===================

-- ENUM → VARCHAR dönüşümü
ALTER TABLE work_orders ALTER COLUMN order_type TYPE VARCHAR(30) USING order_type::text;
ALTER TABLE work_orders ALTER COLUMN status TYPE VARCHAR(30) USING status::text;

-- Eksik kolonlar
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(20);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS plant_code VARCHAR(10);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS lines JSONB DEFAULT '[]';

-- warehouse_id FK'ı opsiyonel yap (app warehouse_code string kullanıyor)
ALTER TABLE work_orders ALTER COLUMN warehouse_id DROP NOT NULL;

-- priority: INT → VARCHAR (app "MEDIUM", "HIGH" string kullanıyor)
ALTER TABLE work_orders ALTER COLUMN priority TYPE VARCHAR(20) USING priority::text;
ALTER TABLE work_orders ALTER COLUMN priority SET DEFAULT 'MEDIUM';

-- sap_delivery_type: VARCHAR(4) yetersiz olabilir
ALTER TABLE work_orders ALTER COLUMN sap_delivery_type TYPE VARCHAR(20);

-- sap_delivery_no: VARCHAR(10) yetersiz — daha geniş tut
ALTER TABLE work_orders ALTER COLUMN sap_delivery_no TYPE VARCHAR(30);

-- sap_ship_to / sap_sold_to: VARCHAR(10) yetersiz — app uzun isimler kullanıyor
ALTER TABLE work_orders ALTER COLUMN sap_ship_to TYPE VARCHAR(200);
ALTER TABLE work_orders ALTER COLUMN sap_sold_to TYPE VARCHAR(200);

-- sap_delivery_no UNIQUE constraint'ı kaldır (aynı teslimat birden fazla kez gelebilir)
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_sap_delivery_no_key;

-- ===================
-- MOVEMENT MAPPINGS — warehouse_code ekleme
-- ===================
ALTER TABLE movement_mappings ALTER COLUMN warehouse_id DROP NOT NULL;
ALTER TABLE movement_mappings ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(20);
ALTER TABLE movement_mappings DROP CONSTRAINT IF EXISTS movement_mappings_warehouse_id_wms_action_code_key;

-- ===================
-- TRANSACTION LOGS — Eksik kolonlar ve tip değişiklikleri
-- ===================

-- Partial index'leri kaldır (ENUM tip referansı içeriyorlar)
DROP INDEX IF EXISTS idx_tl_retry;
DROP INDEX IF EXISTS idx_tl_dlq;

-- ENUM → VARCHAR dönüşümü
ALTER TABLE transaction_logs ALTER COLUMN direction TYPE VARCHAR(30) USING direction::text;
ALTER TABLE transaction_logs ALTER COLUMN status TYPE VARCHAR(30) USING status::text;

-- Partial index'leri VARCHAR ile yeniden oluştur
CREATE INDEX idx_tl_retry ON transaction_logs(next_retry_at) WHERE status = 'RETRYING';
CREATE INDEX idx_tl_dlq ON transaction_logs(id) WHERE status = 'DEAD' AND is_editable = true;

-- Eksik kolon: correlation_id
ALTER TABLE transaction_logs ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(50);

-- Index: correlation_id ile zincir sorgusu
CREATE INDEX IF NOT EXISTS idx_tl_correlation ON transaction_logs(correlation_id);

-- ===================
-- RECONCILIATION REPORTS — run_date esnekliği + kolon uyumu
-- ===================
ALTER TABLE reconciliation_reports ALTER COLUMN run_date TYPE VARCHAR(30) USING run_date::text;
ALTER TABLE reconciliation_reports ALTER COLUMN warehouse_id DROP NOT NULL;
ALTER TABLE reconciliation_reports ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(20);
ALTER TABLE reconciliation_reports ADD COLUMN IF NOT EXISTS sap_open_count INT DEFAULT 0;
ALTER TABLE reconciliation_reports ADD COLUMN IF NOT EXISTS wms_open_count INT DEFAULT 0;

COMMIT;
