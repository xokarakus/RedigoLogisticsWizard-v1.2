-- ============================================================
-- RedigoLogisticsWizard v1.2 - Scheduled Jobs (SAP SM36/SM37 benzeri)
-- ============================================================

BEGIN;

-- Job tanimlari
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  job_type        VARCHAR(50) NOT NULL,
  -- FETCH_FROM_SAP, SEND_TO_3PL, POST_GOODS_ISSUE, POST_GOODS_RECEIPT,
  -- QUERY_STATUS, RECONCILIATION, CLEANUP_LOGS, CUSTOM
  job_class       VARCHAR(1) DEFAULT 'B',  -- A=Yuksek, B=Orta, C=Dusuk (SAP uyumlu)
  schedule_type   VARCHAR(20) DEFAULT 'MANUAL',
  -- MANUAL, IMMEDIATE, ONCE, PERIODIC
  cron_expression VARCHAR(50),             -- PERIODIC icin: '0 */2 * * *' gibi
  scheduled_at    TIMESTAMPTZ,             -- ONCE icin: belirli tarih/saat
  is_active       BOOLEAN DEFAULT true,
  config          JSONB DEFAULT '{}',      -- Job parametreleri (warehouse, delivery_type, plant vb.)
  last_run_at     TIMESTAMPTZ,
  last_run_status VARCHAR(20),             -- SUCCESS, FAILED, RUNNING
  next_run_at     TIMESTAMPTZ,
  run_count       INTEGER DEFAULT 0,
  success_count   INTEGER DEFAULT 0,
  fail_count      INTEGER DEFAULT 0,
  created_by      VARCHAR(100),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sj_tenant ON scheduled_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sj_active ON scheduled_jobs(is_active, next_run_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sj_type ON scheduled_jobs(job_type);

-- Job calisma gecmisi
CREATE TABLE IF NOT EXISTS job_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
  tenant_id       UUID REFERENCES tenants(id),
  status          VARCHAR(20) DEFAULT 'RUNNING',
  -- RUNNING, SUCCESS, FAILED, CANCELLED
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER,
  processed_count INTEGER DEFAULT 0,
  success_count   INTEGER DEFAULT 0,
  fail_count      INTEGER DEFAULT 0,
  result          JSONB,                   -- { details: [...], errors: [...] }
  error_message   TEXT,
  triggered_by    VARCHAR(50) DEFAULT 'MANUAL'  -- MANUAL, SCHEDULER, API
);

CREATE INDEX IF NOT EXISTS idx_je_job ON job_executions(job_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_je_tenant ON job_executions(tenant_id);

COMMIT;
