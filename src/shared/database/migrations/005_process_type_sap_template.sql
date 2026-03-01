-- ============================================================
-- RedigoLogisticsWizard v1.2 - Process Type SAP JSON Template
-- Her süreç tipine varsayılan SAP JSON şablonu ekler.
-- Alan eşleştirme oluşturulurken otomatik doldurulur.
-- ============================================================

BEGIN;

ALTER TABLE process_types ADD COLUMN IF NOT EXISTS sap_sample_json JSONB DEFAULT '{}';

COMMIT;
