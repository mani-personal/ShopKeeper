ALTER TABLE vendors ADD COLUMN valid_until BIGINT, ADD COLUMN trial_days INTEGER NOT NULL DEFAULT 10;
CREATE TABLE pricing_config(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0);
INSERT INTO pricing_config(id,data) VALUES(1,'{"monthly":1000,"yearly":10000,"trialDays":10,"upiId":"","payee":"Shopkeeper","headline":"One store. Everything in order."}');
CREATE TABLE subscription_history(id TEXT PRIMARY KEY,vendor_id TEXT NOT NULL REFERENCES vendors(id),kind TEXT NOT NULL,plan TEXT,amount NUMERIC(12,2) NOT NULL DEFAULT 0,days INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL,reference TEXT NOT NULL DEFAULT '',created_at BIGINT NOT NULL,approved_at BIGINT,valid_until BIGINT,actor TEXT NOT NULL);
CREATE INDEX subscription_vendor ON subscription_history(vendor_id,created_at);
