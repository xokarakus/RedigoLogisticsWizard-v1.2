BEGIN;

ALTER TABLE field_mappings ADD COLUMN IF NOT EXISTS timeout_ms INTEGER DEFAULT 30000;

COMMENT ON COLUMN field_mappings.timeout_ms IS 'API dispatch timeout in milliseconds (default 30000)';

COMMIT;

-- DOWN
BEGIN;
ALTER TABLE field_mappings DROP COLUMN IF EXISTS timeout_ms;
COMMIT;
