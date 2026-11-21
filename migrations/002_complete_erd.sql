-- Complete ERD_SIMPASCA (1).png without modifying existing tables/data.
-- Status/type vocabularies are intentionally open: the ERD defines no enums.
CREATE TABLE disasters (
  id SERIAL PRIMARY KEY,
  disaster_type VARCHAR(100) NOT NULL,
  province VARCHAR(150) NOT NULL,
  regency_city VARCHAR(150) NOT NULL,
  latitude NUMERIC(10, 7) CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(10, 7) CHECK (longitude BETWEEN -180 AND 180),
  location_details TEXT,
  status VARCHAR(50) NOT NULL,
  handling_scale VARCHAR(50) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  affected_people INTEGER NOT NULL DEFAULT 0 CHECK (affected_people >= 0),
  affected_households INTEGER NOT NULL DEFAULT 0 CHECK (affected_households >= 0),
  impact_notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE inventory_items (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(100) NOT NULL,
  stock_unit VARCHAR(50) NOT NULL,
  initial_stock NUMERIC(15, 3) NOT NULL DEFAULT 0 CHECK (initial_stock >= 0),
  need_ratio NUMERIC(15, 6) CHECK (need_ratio > 0),
  need_type VARCHAR(50),
  ratio_basis VARCHAR(50),
  expiration_date DATE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE shipments (
  id SERIAL PRIMARY KEY,
  disaster_id INTEGER NOT NULL REFERENCES disasters(id) ON DELETE RESTRICT,
  status VARCHAR(50) NOT NULL,
  shipped_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  destination TEXT NOT NULL,
  person_in_charge VARCHAR(150) NOT NULL,
  request_key VARCHAR(100) NOT NULL UNIQUE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (received_at IS NULL OR (shipped_at IS NOT NULL AND received_at >= shipped_at))
);

CREATE TABLE shipment_items (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(15, 3) NOT NULL CHECK (quantity > 0),
  deleted_at TIMESTAMPTZ,
  UNIQUE (shipment_id, item_id)
);

CREATE TABLE stock_receipts (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(15, 3) NOT NULL CHECK (quantity > 0),
  receipt_date DATE NOT NULL,
  source_giver VARCHAR(150) NOT NULL,
  item_condition VARCHAR(100) NOT NULL,
  notes TEXT,
  request_key VARCHAR(100) NOT NULL UNIQUE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE stock_movements (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  disaster_id INTEGER REFERENCES disasters(id) ON DELETE RESTRICT,
  receipt_id INTEGER REFERENCES stock_receipts(id) ON DELETE RESTRICT,
  shipment_item_id INTEGER REFERENCES shipment_items(id) ON DELETE RESTRICT,
  movement_type VARCHAR(50) NOT NULL,
  quantity_in NUMERIC(15, 3) NOT NULL DEFAULT 0 CHECK (quantity_in >= 0),
  quantity_out NUMERIC(15, 3) NOT NULL DEFAULT 0 CHECK (quantity_out >= 0),
  movement_date DATE NOT NULL,
  notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((quantity_in > 0 AND quantity_out = 0) OR (quantity_out > 0 AND quantity_in = 0)),
  CHECK (receipt_id IS NULL OR shipment_item_id IS NULL)
);

CREATE TABLE generated_reports (
  id SERIAL PRIMARY KEY,
  disaster_id INTEGER NOT NULL REFERENCES disasters(id) ON DELETE RESTRICT,
  report_snapshot JSONB NOT NULL,
  generated_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  generated_by_name VARCHAR(150) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id INTEGER NOT NULL,
  before_data JSONB,
  after_data JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX disasters_created_by_idx ON disasters (created_by);
CREATE INDEX disasters_occurred_at_idx ON disasters (occurred_at DESC, id DESC);
CREATE INDEX inventory_items_created_by_idx ON inventory_items (created_by);
CREATE INDEX shipments_disaster_id_idx ON shipments (disaster_id);
CREATE INDEX shipments_created_by_idx ON shipments (created_by);
CREATE INDEX shipments_active_created_at_idx ON shipments (created_at DESC, id DESC) WHERE deleted_at IS NULL;
-- The UNIQUE index already covers lookups by shipment_id.
CREATE INDEX shipment_items_item_id_idx ON shipment_items (item_id);
CREATE INDEX stock_receipts_item_id_idx ON stock_receipts (item_id);
CREATE INDEX stock_receipts_created_by_idx ON stock_receipts (created_by);
CREATE INDEX stock_receipts_active_date_idx ON stock_receipts (receipt_date DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX stock_movements_item_date_idx ON stock_movements (item_id, movement_date DESC, id DESC);
CREATE INDEX stock_movements_disaster_id_idx ON stock_movements (disaster_id);
CREATE INDEX stock_movements_receipt_id_idx ON stock_movements (receipt_id);
CREATE INDEX stock_movements_shipment_item_id_idx ON stock_movements (shipment_item_id);
CREATE INDEX stock_movements_created_by_idx ON stock_movements (created_by);
CREATE INDEX generated_reports_disaster_id_idx ON generated_reports (disaster_id);
CREATE INDEX generated_reports_generated_by_idx ON generated_reports (generated_by);
CREATE INDEX audit_logs_user_id_idx ON audit_logs (user_id);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, occurred_at DESC);