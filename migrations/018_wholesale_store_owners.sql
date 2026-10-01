CREATE TABLE wholesale_store_owners(
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wholesaler_id TEXT NOT NULL REFERENCES wholesalers(user_id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  PRIMARY KEY(owner_user_id, wholesaler_id)
);
CREATE INDEX wholesale_store_owners_store ON wholesale_store_owners(wholesaler_id, created_at);
INSERT INTO wholesale_store_owners(owner_user_id, wholesaler_id, created_at)
SELECT user_id, user_id, created_at FROM wholesalers
ON CONFLICT DO NOTHING;
