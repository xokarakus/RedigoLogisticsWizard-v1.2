-- Unique constraint'leri tenant-scoped yap
-- Wizard ile aynı warehouse/process kodlarını farklı tenant'lara atayabilmek için

-- warehouses: code → (tenant_id, code)
ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS warehouses_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_tenant_code ON warehouses(tenant_id, code);

-- process_types: code → (tenant_id, code)
ALTER TABLE process_types DROP CONSTRAINT IF EXISTS process_types_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_process_types_tenant_code ON process_types(tenant_id, code);

-- process_configs: (plant_code, warehouse_code, delivery_type) → (tenant_id, plant_code, warehouse_code, delivery_type)
ALTER TABLE process_configs DROP CONSTRAINT IF EXISTS process_configs_plant_code_warehouse_code_delivery_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_process_configs_tenant_combo ON process_configs(tenant_id, plant_code, warehouse_code, delivery_type);

-- field_mappings: wizard idempotency için (tenant_id, process_type, company_code, direction, description)
CREATE UNIQUE INDEX IF NOT EXISTS uq_field_mappings_tenant_combo ON field_mappings(tenant_id, process_type, company_code, direction, description);

-- movement_mappings: wizard idempotency için (tenant_id, warehouse_code, wms_action_code)
CREATE UNIQUE INDEX IF NOT EXISTS uq_movement_mappings_tenant_combo ON movement_mappings(tenant_id, warehouse_code, wms_action_code);
