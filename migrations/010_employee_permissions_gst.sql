ALTER TABLE users ADD COLUMN employee_permissions TEXT;

UPDATE users
SET employee_permissions='["dashboard","sales","inventory","purchases","customers","returns","payments","reports","settings","employees"]'
WHERE id IN (SELECT user_id FROM wholesale_memberships);

UPDATE users u
SET employee_permissions='["dashboard","sales","inventory","purchases","customers","returns","payments","reports","settings","employees"]'
WHERE u.role='vendor'
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id=u.id
      AND u.created_at>(
        SELECT MIN(owner.created_at)
        FROM memberships first_membership
        JOIN users owner ON owner.id=first_membership.user_id
        WHERE first_membership.vendor_id=m.vendor_id
      )
  );

ALTER TABLE wholesale_products ADD COLUMN hsn_code TEXT NOT NULL DEFAULT '';
ALTER TABLE wholesale_products ADD COLUMN gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(gst_rate IN (0,5,12,18,28));
ALTER TABLE wholesale_request_items ADD COLUMN hsn_code TEXT NOT NULL DEFAULT '';
ALTER TABLE wholesale_request_items ADD COLUMN gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(gst_rate IN (0,5,12,18,28));
