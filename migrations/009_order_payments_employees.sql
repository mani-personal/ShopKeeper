ALTER TABLE wholesalers ADD COLUMN payment_upi_id TEXT NOT NULL DEFAULT '';
ALTER TABLE wholesalers ADD COLUMN payment_payee_name TEXT NOT NULL DEFAULT '';

ALTER TABLE wholesale_transactions ADD COLUMN submitted_by_vendor BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE wholesale_transactions ADD COLUMN confirmed_at BIGINT;
ALTER TABLE wholesale_transactions ADD COLUMN rejected_at BIGINT;
ALTER TABLE wholesale_transactions ADD COLUMN rejection_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE wholesale_transactions DROP CONSTRAINT wholesale_transactions_payment_status_check;
ALTER TABLE wholesale_transactions ADD CONSTRAINT wholesale_transactions_payment_status_check CHECK(payment_status IN ('pending','paid','partial','rejected'));

ALTER TABLE activity_events ADD COLUMN route TEXT NOT NULL DEFAULT '';

CREATE TABLE wholesale_memberships(
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  wholesaler_id TEXT NOT NULL REFERENCES wholesalers(user_id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL
);
CREATE INDEX wholesale_memberships_seller ON wholesale_memberships(wholesaler_id,created_at);
