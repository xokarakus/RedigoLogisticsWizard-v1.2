-- Performance indexes for hot-path queries
CREATE INDEX IF NOT EXISTS idx_wo_sap_delivery_no ON work_orders(sap_delivery_no);
CREATE INDEX IF NOT EXISTS idx_tx_correlation ON transaction_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_wo_tenant_delivery ON work_orders(tenant_id, sap_delivery_no);
