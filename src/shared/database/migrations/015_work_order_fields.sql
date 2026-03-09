-- Migration 015: İş Emri SAP Alanları
-- Gönderen/Alan Üretim Yeri, Gönderen/Alan Depo, Sevkiyat Noktası, Tedarikçi

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sap_stor_loc VARCHAR(4);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sap_target_plant VARCHAR(10);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sap_target_stor_loc VARCHAR(4);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sap_shipping_point VARCHAR(10);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sap_vendor_no VARCHAR(10);

-- Mevcut kayıtları sap_raw_payload'dan doldur
UPDATE work_orders
SET sap_stor_loc = sap_raw_payload->'HEADER'->>'LGORT'
WHERE sap_stor_loc IS NULL AND sap_raw_payload->'HEADER'->>'LGORT' IS NOT NULL;

UPDATE work_orders
SET sap_target_plant = sap_raw_payload->'HEADER'->>'UMWRK'
WHERE sap_target_plant IS NULL AND sap_raw_payload->'HEADER'->>'UMWRK' IS NOT NULL;

UPDATE work_orders
SET sap_target_stor_loc = sap_raw_payload->'HEADER'->>'UMLGO'
WHERE sap_target_stor_loc IS NULL AND sap_raw_payload->'HEADER'->>'UMLGO' IS NOT NULL;

UPDATE work_orders
SET sap_shipping_point = sap_raw_payload->'HEADER'->>'VSTEL'
WHERE sap_shipping_point IS NULL AND sap_raw_payload->'HEADER'->>'VSTEL' IS NOT NULL;

UPDATE work_orders
SET sap_vendor_no = sap_raw_payload->'HEADER'->>'LIFNR'
WHERE sap_vendor_no IS NULL AND sap_raw_payload->'HEADER'->>'LIFNR' IS NOT NULL;

COMMENT ON COLUMN work_orders.plant_code IS 'Gönderen Üretim Yeri (SAP WERKS)';
COMMENT ON COLUMN work_orders.sap_stor_loc IS 'Gönderen Depo (SAP LGORT)';
COMMENT ON COLUMN work_orders.sap_target_plant IS 'Alan Üretim Yeri (SAP UMWRK)';
COMMENT ON COLUMN work_orders.sap_target_stor_loc IS 'Alan Depo (SAP UMLGO)';
COMMENT ON COLUMN work_orders.sap_shipping_point IS 'Sevkiyat Noktası (SAP VSTEL)';
COMMENT ON COLUMN work_orders.sap_vendor_no IS 'Tedarikçi No (SAP LIFNR)';
