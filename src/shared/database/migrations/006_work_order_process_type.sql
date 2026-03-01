-- Work order'a process_type kolonu ekle (entegrasyondan gelen süreç tipi)
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS process_type VARCHAR(30);

-- Mevcut work order'ları transaction_logs'dan güncelle
UPDATE work_orders wo
SET process_type = REPLACE(tl.action, 'INBOUND_', '')
FROM transaction_logs tl
WHERE tl.correlation_id::text = wo.correlation_id::text
  AND tl.direction = 'INBOUND'
  AND tl.action LIKE 'INBOUND_%'
  AND wo.process_type IS NULL;
