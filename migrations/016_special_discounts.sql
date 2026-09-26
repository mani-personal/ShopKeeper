ALTER TABLE wholesale_products ADD COLUMN special_discount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (special_discount >= 0);
ALTER TABLE wholesale_products ADD COLUMN special_active BOOLEAN NOT NULL DEFAULT FALSE;
