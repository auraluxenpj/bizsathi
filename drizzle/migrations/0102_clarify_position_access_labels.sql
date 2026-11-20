-- 0102: use clear employee-facing labels for the standard position bundles.
UPDATE public.business_access_roles
SET name = CASE code
  WHEN 'position_partner' THEN 'Partner / Administrator'
  WHEN 'position_manager' THEN 'Manager'
  WHEN 'position_branch_manager' THEN 'Branch Manager'
  WHEN 'position_accountant' THEN 'Accountant'
  WHEN 'position_department_manager' THEN 'Department Manager'
  WHEN 'position_sales_person' THEN 'Cashier / POS'
  WHEN 'position_stock_manager' THEN 'Inventory Manager'
  WHEN 'position_entry_person' THEN 'Store Assistant'
  ELSE name
END,
description = CASE code
  WHEN 'position_sales_person' THEN 'POS checkout, customer lookup and customer creation. Sale returns are submitted for manager approval.'
  WHEN 'position_stock_manager' THEN 'Inventory, stock adjustments, purchase receiving and supplier workflows.'
  WHEN 'position_entry_person' THEN 'Routine store entry and operational data capture.'
  ELSE description
END,
updated_at = now()
WHERE business_id = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'
  AND code LIKE 'position_%';