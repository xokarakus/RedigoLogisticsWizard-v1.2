-- Migration 030: Add warehouse_id to field_mappings for direct warehouse-based routing
-- Replaces process_configs intermediate lookup
BEGIN;

ALTER TABLE field_mappings ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);

-- Mevcut field_mappings'i company_code uzerinden eslestir
UPDATE field_mappings fm SET warehouse_id = w.id
  FROM warehouses w
  WHERE w.company_code = fm.company_code
    AND w.tenant_id = fm.tenant_id
    AND fm.warehouse_id IS NULL;

COMMIT;
