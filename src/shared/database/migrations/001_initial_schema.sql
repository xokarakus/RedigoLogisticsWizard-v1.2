-- ============================================================
-- RedigoLogisticsWizard v1.2 - Initial Schema
-- The Logistics Cockpit: SAP <-> 3PL/WMS Integration Middleware
-- ============================================================
-- IRON RULE: No config row used in a transaction can be deleted.
--            ON DELETE RESTRICT everywhere. Archive via is_active = false.
-- ============================================================

BEGIN;

-- ===================
-- ENUM TYPES
-- ===================
CREATE TYPE work_order_type AS ENUM ('OUTBOUND', 'INBOUND');
CREATE TYPE work_order_status AS ENUM (
  'RECEIVED',        -- Ingested from SAP
  'SENT_TO_WMS',     -- Dispatched to 3PL
  'IN_PROGRESS',     -- WMS acknowledged / picking started
  'PARTIALLY_DONE',  -- Partial confirmation from WMS
  'COMPLETED',       -- Fully confirmed
  'PGI_POSTED',      -- Goods Issue posted in SAP (outbound)
  'GR_POSTED',       -- Goods Receipt posted in SAP (inbound)
  'FAILED',          -- Processing error
  'CANCELLED'        -- Cancelled in SAP or WMS
);
CREATE TYPE transaction_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'RETRYING', 'DEAD');
CREATE TYPE sync_direction AS ENUM ('SAP_TO_WMS', 'WMS_TO_SAP');

-- ===================
-- WAREHOUSE CONFIG
-- ===================
CREATE TABLE warehouses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(20) NOT NULL UNIQUE,         -- e.g. 'WH-IST-01'
  name          VARCHAR(100) NOT NULL,
  sap_plant     VARCHAR(4) NOT NULL,                 -- SAP Werk (WERKS)
  sap_stor_loc  VARCHAR(4) NOT NULL,                 -- SAP Storage Location (LGORT)
  wms_code      VARCHAR(50) NOT NULL,                -- 3PL warehouse identifier
  wms_provider  VARCHAR(50) NOT NULL,                -- e.g. 'CEVA', 'DHL', 'HOPI'
  is_active     BOOLEAN NOT NULL DEFAULT true,
  config        JSONB DEFAULT '{}',                  -- Provider-specific config
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================
-- WORK ORDERS (The Core Abstraction)
-- ===================
-- Whether LF, RL, NL... everything is a WorkOrder.
CREATE TABLE work_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SAP Reference
  sap_delivery_no   VARCHAR(10) NOT NULL,             -- VBELN from LIKP
  sap_delivery_type VARCHAR(4) NOT NULL,              -- LFART (LF, RL, NL, EL...)
  sap_doc_date      DATE,
  sap_ship_to       VARCHAR(10),                      -- KUNNR / KUNAG
  sap_sold_to       VARCHAR(10),

  -- Redigo Abstraction
  order_type         work_order_type NOT NULL,
  status             work_order_status NOT NULL DEFAULT 'RECEIVED',
  warehouse_id       UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,

  -- WMS Reference
  wms_order_id       VARCHAR(100),                    -- 3PL's own order reference

  -- Timestamps
  received_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_to_wms_at     TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  sap_posted_at      TIMESTAMPTZ,                     -- PGI or GR timestamp

  -- Payloads (raw data for replay/debug)
  sap_raw_payload    JSONB,                           -- Original LIKP/LIPS data
  wms_raw_payload    JSONB,                           -- Last WMS confirmation

  -- Metadata
  priority           INT NOT NULL DEFAULT 0,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(sap_delivery_no)
);

CREATE INDEX idx_wo_status ON work_orders(status);
CREATE INDEX idx_wo_warehouse ON work_orders(warehouse_id);
CREATE INDEX idx_wo_type ON work_orders(order_type);
CREATE INDEX idx_wo_received ON work_orders(received_at);

-- ===================
-- WORK ORDER LINES (LIPS level)
-- ===================
CREATE TABLE work_order_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id     UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,

  -- SAP fields
  sap_item_no       VARCHAR(6) NOT NULL,              -- POSNR
  sap_material      VARCHAR(18) NOT NULL,             -- MATNR
  sap_batch         VARCHAR(10),                      -- CHARG
  sap_requested_qty DECIMAL(13,3) NOT NULL,           -- LFIMG (original)
  sap_uom           VARCHAR(3) NOT NULL,              -- VRKME (sales unit)

  -- WMS confirmed
  wms_picked_qty    DECIMAL(13,3) DEFAULT 0,
  wms_uom           VARCHAR(10),                      -- Base unit from WMS
  wms_serial_numbers JSONB DEFAULT '[]',
  wms_hu_ids        JSONB DEFAULT '[]',               -- Handling Unit / Pallet IDs

  -- SAP posted (after update)
  sap_final_qty     DECIMAL(13,3),                    -- What was posted to SAP
  is_closed         BOOLEAN NOT NULL DEFAULT false,    -- ELIKZ equivalent

  -- Kit/BOM
  is_kit_header     BOOLEAN NOT NULL DEFAULT false,
  kit_parent_id     UUID REFERENCES work_order_lines(id),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(work_order_id, sap_item_no)
);

CREATE INDEX idx_wol_wo ON work_order_lines(work_order_id);
CREATE INDEX idx_wol_material ON work_order_lines(sap_material);

-- ===================
-- MOVEMENT TYPE MAPPING (Module B)
-- ===================
-- Configurable WMS Action -> SAP Movement Type mapping
CREATE TABLE movement_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  wms_action_code VARCHAR(50) NOT NULL,               -- e.g. 'SCRAP', 'DAMAGED', 'TRANSFER'
  sap_movement_type VARCHAR(3) NOT NULL,              -- BWART: 551, 344, 311, 301...
  sap_plant       VARCHAR(4),                         -- Optional override
  sap_stor_loc    VARCHAR(4),                         -- Optional override
  sap_to_plant    VARCHAR(4),                         -- For plant-to-plant (301)
  sap_to_stor_loc VARCHAR(4),                         -- For SLoc-to-SLoc (311)
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(warehouse_id, wms_action_code)
);

-- ===================
-- TRANSACTION LOG (The Audit Trail)
-- ===================
CREATE TABLE transaction_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference
  work_order_id   UUID REFERENCES work_orders(id) ON DELETE RESTRICT,
  movement_mapping_id UUID REFERENCES movement_mappings(id) ON DELETE RESTRICT,

  -- What happened
  direction       sync_direction NOT NULL,
  action          VARCHAR(100) NOT NULL,               -- e.g. 'PGI_POST', 'GR_POST', 'DELIVERY_UPDATE', 'INV_MOVEMENT'
  status          transaction_status NOT NULL DEFAULT 'PENDING',

  -- SAP call details
  sap_function    VARCHAR(100),                        -- BAPI name called
  sap_request     JSONB,                               -- What we sent
  sap_response    JSONB,                               -- What SAP returned
  sap_doc_number  VARCHAR(20),                         -- Material Doc / PGI Doc created

  -- Error handling
  error_message   TEXT,
  error_code      VARCHAR(50),
  retry_count     INT NOT NULL DEFAULT 0,
  max_retries     INT NOT NULL DEFAULT 3,
  next_retry_at   TIMESTAMPTZ,

  -- Replay support (DLQ)
  is_editable     BOOLEAN NOT NULL DEFAULT false,      -- true when in DLQ
  edited_payload  JSONB,                               -- Modified payload for replay
  replayed_from   UUID REFERENCES transaction_logs(id),-- If this is a replay, link to original

  -- Timing
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  duration_ms     INT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tl_wo ON transaction_logs(work_order_id);
CREATE INDEX idx_tl_status ON transaction_logs(status);
CREATE INDEX idx_tl_action ON transaction_logs(action);
CREATE INDEX idx_tl_direction ON transaction_logs(direction);
CREATE INDEX idx_tl_retry ON transaction_logs(next_retry_at) WHERE status = 'RETRYING';
CREATE INDEX idx_tl_dlq ON transaction_logs(id) WHERE status = 'DEAD' AND is_editable = true;

-- ===================
-- MASTER DATA CACHE (Module C)
-- ===================
CREATE TABLE materials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sap_material_no VARCHAR(18) NOT NULL UNIQUE,         -- MATNR
  description     VARCHAR(200),
  material_group  VARCHAR(9),                          -- MATKL
  base_uom        VARCHAR(3) NOT NULL,                 -- MEINS
  gross_weight    DECIMAL(13,3),
  net_weight      DECIMAL(13,3),
  weight_unit     VARCHAR(3),
  unit_conversions JSONB DEFAULT '[]',                 -- From MARM: [{uom: 'CS', factor: 12}, ...]
  is_kit          BOOLEAN NOT NULL DEFAULT false,
  kit_components  JSONB DEFAULT '[]',                  -- BOM components if is_kit
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE business_partners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sap_partner_no  VARCHAR(10) NOT NULL UNIQUE,         -- KUNNR or LIFNR
  partner_type    VARCHAR(10) NOT NULL,                -- 'CUSTOMER' or 'VENDOR'
  name            VARCHAR(200) NOT NULL,
  city            VARCHAR(50),
  country         VARCHAR(3),
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================
-- RECONCILIATION REPORTS (Module D)
-- ===================
CREATE TABLE reconciliation_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date        DATE NOT NULL,
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  total_sap_open  INT NOT NULL DEFAULT 0,
  total_wms_open  INT NOT NULL DEFAULT 0,
  discrepancies   JSONB DEFAULT '[]',                  -- [{delivery: '80001234', issue: 'missing_in_wms'}, ...]
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, COMPLETED, REVIEWED
  reviewed_by     VARCHAR(100),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================
-- ANTI-DELETE TRIGGERS (The Iron Rule)
-- ===================
-- Prevent deletion of warehouses used in work_orders
-- (Already handled by ON DELETE RESTRICT, but belt-and-suspenders)

CREATE OR REPLACE FUNCTION prevent_config_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'DELETE not allowed on %. Use is_active = false to archive.', TG_TABLE_NAME;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_no_delete_warehouses
  BEFORE DELETE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION prevent_config_delete();

CREATE TRIGGER trg_no_delete_movement_mappings
  BEFORE DELETE ON movement_mappings
  FOR EACH ROW EXECUTE FUNCTION prevent_config_delete();

-- ===================
-- UPDATED_AT AUTO-TRIGGER
-- ===================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_warehouses_updated BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_work_orders_updated BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_work_order_lines_updated BEFORE UPDATE ON work_order_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_movement_mappings_updated BEFORE UPDATE ON movement_mappings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_materials_updated BEFORE UPDATE ON materials FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_business_partners_updated BEFORE UPDATE ON business_partners FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
