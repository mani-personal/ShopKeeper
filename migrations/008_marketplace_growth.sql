ALTER TABLE wholesalers ADD COLUMN gst_number TEXT NOT NULL DEFAULT '';
ALTER TABLE wholesalers ADD COLUMN service_areas TEXT NOT NULL DEFAULT '';
ALTER TABLE wholesalers ADD COLUMN brands TEXT NOT NULL DEFAULT '';
ALTER TABLE wholesalers ADD COLUMN min_order NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE wholesalers ADD COLUMN delivery_days INTEGER NOT NULL DEFAULT 2;
ALTER TABLE wholesalers ADD COLUMN verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE wholesalers ADD COLUMN visibility_mode TEXT NOT NULL DEFAULT 'selected' CHECK(visibility_mode IN ('selected','public'));

ALTER TABLE wholesale_products ADD COLUMN category TEXT NOT NULL DEFAULT 'General';
ALTER TABLE wholesale_products ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE wholesale_products ADD COLUMN mrp NUMERIC(12,2);
ALTER TABLE wholesale_products ADD COLUMN min_qty INTEGER NOT NULL DEFAULT 1;
ALTER TABLE wholesale_products ADD COLUMN bulk_qty INTEGER;
ALTER TABLE wholesale_products ADD COLUMN bulk_price NUMERIC(12,2);

ALTER TABLE wholesale_requests DROP CONSTRAINT wholesale_requests_status_check;
ALTER TABLE wholesale_requests ADD CONSTRAINT wholesale_requests_status_check CHECK(status IN ('pending','accepted','quoted','approved','packed','dispatched','delivered','completed','cancelled'));
ALTER TABLE wholesale_requests ADD COLUMN delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE wholesale_requests ADD COLUMN quoted_total NUMERIC(12,2);
ALTER TABLE wholesale_requests ADD COLUMN quote_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE wholesale_requests ADD COLUMN expected_delivery BIGINT;
ALTER TABLE wholesale_requests ADD COLUMN inventory_received BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE wholesale_requests ADD COLUMN accepted_at BIGINT;

CREATE TABLE wholesale_vendor_favourites(
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  wholesaler_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  PRIMARY KEY(vendor_id,wholesaler_id)
);

CREATE TABLE wholesale_reviews(
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES wholesale_requests(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  wholesaler_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);

CREATE INDEX wholesale_favourites_vendor ON wholesale_vendor_favourites(vendor_id,created_at);
CREATE INDEX wholesale_reviews_seller ON wholesale_reviews(wholesaler_id,created_at);
