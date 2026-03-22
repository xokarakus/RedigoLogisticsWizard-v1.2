-- Migration 029: Allow DELETE on field_mappings table
-- Remove Iron Rule trigger that prevents deletion of field mapping records
BEGIN;

DROP TRIGGER IF EXISTS trg_no_delete_field_mappings ON field_mappings;

COMMIT;
