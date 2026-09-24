ALTER TABLE wholesalers ADD COLUMN business_category TEXT NOT NULL DEFAULT 'General store';
ALTER TABLE users ADD COLUMN employee_designation TEXT NOT NULL DEFAULT 'custom';
UPDATE users
SET employee_permissions=REPLACE(employee_permissions,'"sales",','')
WHERE employee_permissions IS NOT NULL
  AND id IN (SELECT user_id FROM wholesale_memberships);
