-- work_order_lines tablosuna tenant_id ekleme
-- Tenant izolasyonu work_orders uzerinden dolayili saglaniyor
-- ancak direkt sorgular icin (raporlama, toplu islem) tenant_id gerekli

ALTER TABLE work_order_lines ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Mevcut kayitlari parent work_orders'tan doldur
UPDATE work_order_lines wol
SET tenant_id = wo.tenant_id
FROM work_orders wo
WHERE wol.work_order_id = wo.id
  AND wol.tenant_id IS NULL;

-- Index
CREATE INDEX IF NOT EXISTS idx_wol_tenant ON work_order_lines(tenant_id);

-- Composite index: tenant + material (sik kullanilan sorgu patterni)
CREATE INDEX IF NOT EXISTS idx_wol_tenant_material ON work_order_lines(tenant_id, sap_material);
