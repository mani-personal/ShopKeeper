ALTER TABLE wholesalers ADD COLUMN logo_image TEXT;
ALTER TABLE wholesalers ADD COLUMN trial_started_at BIGINT;
ALTER TABLE wholesalers ADD COLUMN trial_days INTEGER NOT NULL DEFAULT 7;
ALTER TABLE wholesalers ADD COLUMN valid_until BIGINT;
UPDATE wholesalers SET trial_started_at=created_at WHERE trial_started_at IS NULL;

CREATE TABLE wholesale_pricing_config(
  id INTEGER PRIMARY KEY CHECK(id=1),
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0
);
INSERT INTO wholesale_pricing_config(id,data) VALUES(1,'{"monthly":2999,"yearly":29999,"trialDays":7,"upiId":"","payee":"Shopkeeper","headline":"Everything wholesale needs, in one place."}');

CREATE TABLE wholesale_subscription_history(
  id TEXT PRIMARY KEY,
  wholesaler_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  plan TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  days INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  approved_at BIGINT,
  valid_until BIGINT,
  actor TEXT NOT NULL
);
CREATE INDEX wholesale_subscription_seller ON wholesale_subscription_history(wholesaler_id,created_at);

CREATE TABLE wholesale_payment_proofs(
  payment_id TEXT PRIMARY KEY REFERENCES wholesale_subscription_history(id) ON DELETE CASCADE,
  image BYTEA NOT NULL,
  mime TEXT NOT NULL,
  uploaded_at BIGINT NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id)
);

CREATE TABLE activity_events(
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  vendor_id TEXT REFERENCES vendors(id) ON DELETE CASCADE,
  wholesaler_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK(scope IN ('admin','vendor','wholesale','all')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);
CREATE INDEX activity_events_created ON activity_events(created_at);
CREATE INDEX activity_events_vendor ON activity_events(vendor_id,created_at);
CREATE INDEX activity_events_wholesale ON activity_events(wholesaler_id,created_at);

CREATE TABLE activity_reads(
  event_id TEXT NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at BIGINT NOT NULL,
  PRIMARY KEY(event_id,user_id)
);
