BEGIN;
ALTER TABLE field_mappings ADD COLUMN IF NOT EXISTS name VARCHAR(100);
-- Mevcut kayıtlar için name'i company_code + description'dan türet
UPDATE field_mappings SET name = COALESCE(company_code, '') || ' – ' || COALESCE(description, '')
  WHERE name IS NULL;
COMMIT;
