-- Migration 016: Job Execution Bireysel İş Emri Sonuçları
-- Her job çalışmasında işlenen iş emirlerinin detaylı kaydı

CREATE TABLE IF NOT EXISTS job_execution_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES job_executions(id) ON DELETE CASCADE,
  work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  sap_delivery_no VARCHAR(30),
  status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jei_execution ON job_execution_items(execution_id);
CREATE INDEX IF NOT EXISTS idx_jei_work_order ON job_execution_items(work_order_id);
CREATE INDEX IF NOT EXISTS idx_jei_status ON job_execution_items(status);
