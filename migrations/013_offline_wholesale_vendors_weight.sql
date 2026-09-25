ALTER TABLE wholesale_products ADD COLUMN weight TEXT NOT NULL DEFAULT '';
ALTER TABLE wholesale_request_items ADD COLUMN weight TEXT NOT NULL DEFAULT '';

CREATE TABLE wholesale_offline_vendors (
  id TEXT PRIMARY KEY,
  wholesaler_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX wholesale_offline_vendors_owner ON wholesale_offline_vendors(wholesaler_id,name);

CREATE TABLE wholesale_offline_vendor_ledger (
  id TEXT PRIMARY KEY,
  wholesaler_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL REFERENCES wholesale_offline_vendors(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('sale','payment','refund')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);
CREATE INDEX wholesale_offline_vendor_ledger_vendor ON wholesale_offline_vendor_ledger(wholesaler_id,vendor_id,created_at);
