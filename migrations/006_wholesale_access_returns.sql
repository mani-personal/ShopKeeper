CREATE TABLE wholesale_vendor_access(
  wholesaler_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  PRIMARY KEY(wholesaler_id,vendor_id)
);

CREATE TABLE wholesale_returns(
  id TEXT PRIMARY KEY,
  wholesaler_id TEXT NOT NULL REFERENCES users(id),
  vendor_id TEXT NOT NULL REFERENCES vendors(id),
  request_id TEXT NOT NULL REFERENCES wholesale_requests(id),
  product_id TEXT NOT NULL REFERENCES wholesale_products(id),
  quantity INTEGER NOT NULL CHECK(quantity>0),
  unit_price NUMERIC(12,2) NOT NULL CHECK(unit_price>0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','received','rejected')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX wholesale_access_vendor ON wholesale_vendor_access(vendor_id,wholesaler_id);
CREATE INDEX wholesale_returns_seller ON wholesale_returns(wholesaler_id,created_at);
CREATE INDEX wholesale_returns_vendor ON wholesale_returns(vendor_id,created_at);
