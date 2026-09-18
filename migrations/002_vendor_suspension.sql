ALTER TABLE vendors
 ADD COLUMN suspended BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN suspension_reason TEXT NOT NULL DEFAULT '',
 ADD COLUMN access_changed_at BIGINT,
 ADD COLUMN access_changed_by TEXT;
