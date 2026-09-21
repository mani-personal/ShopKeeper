ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('owner','admin','vendor'));
ALTER TABLE users ADD COLUMN disabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE vendors ADD COLUMN logo_image TEXT;
CREATE TABLE payment_proofs(payment_id TEXT PRIMARY KEY REFERENCES subscription_history(id) ON DELETE CASCADE,image BYTEA NOT NULL,mime TEXT NOT NULL,uploaded_at BIGINT NOT NULL,uploaded_by TEXT NOT NULL REFERENCES users(id));
