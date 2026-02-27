-- ============================================================
-- RedigoLogisticsWizard v1.2 - Job Queue + Work Order Correlation
-- PostgreSQL SKIP LOCKED tabanlı kuyruk mekanizması.
-- Redis/BullMQ bağımlılığı YOKTUR.
-- ============================================================

BEGIN;

-- ===================
-- JOB QUEUE
-- ===================
CREATE TABLE job_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type        VARCHAR(50) NOT NULL,          -- CREATE_WORK_ORDER, DISPATCH_TO_3PL
  correlation_id  UUID NOT NULL,                 -- SAP <-> 3PL tekil numara
  payload         JSONB NOT NULL DEFAULT '{}',
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                  -- PENDING, PROCESSING, COMPLETED, FAILED, DEAD
  attempts        INT NOT NULL DEFAULT 0,
  max_attempts    INT NOT NULL DEFAULT 5,
  last_error      TEXT,
  run_after       TIMESTAMPTZ NOT NULL DEFAULT now(),  -- Retry zamanlama
  locked_at       TIMESTAMPTZ,
  locked_by       VARCHAR(100),
  result          JSONB,
  delivery_no     VARCHAR(30),                   -- Hızlı lookup için
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

-- SKIP LOCKED worker index: sadece PENDING ve zamanı gelmiş işler
CREATE INDEX idx_jq_pending ON job_queue(run_after) WHERE status = 'PENDING';

-- Correlation ID ile zincir sorgusu
CREATE INDEX idx_jq_correlation ON job_queue(correlation_id);

-- Dead Letter Queue sorgusu
CREATE INDEX idx_jq_dead ON job_queue(created_at) WHERE status = 'DEAD';

-- ===================
-- WORK ORDERS — correlation_id ekleme
-- ===================
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS correlation_id UUID;
CREATE INDEX IF NOT EXISTS idx_wo_correlation ON work_orders(correlation_id);

COMMIT;
