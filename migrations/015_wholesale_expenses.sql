CREATE TABLE wholesale_expenses (
  id TEXT PRIMARY KEY,
  wholesaler_id TEXT NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expense_date TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX wholesale_expenses_owner_date ON wholesale_expenses(wholesaler_id,expense_date DESC);
