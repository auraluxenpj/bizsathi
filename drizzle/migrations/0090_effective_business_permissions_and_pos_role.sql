-- 0090: resolve the signed-in member's effective permissions for fail-closed navigation
-- and make the Sales Person / Cashier position a POS-focused permission set.
CREATE OR REPLACE FUNCTION public.get_my_business_permissions(_business uuid)
RETURNS TABLE(permission text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(public.business_role_rank(_business, auth.uid()), 0) <= 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.permission
  FROM public.business_permission_catalog c
  WHERE public.has_permission(_business, c.permission)
  ORDER BY c.permission;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_business_permissions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_business_permissions(uuid) TO authenticated;

-- Cashier / POS keeps only the data permissions required inside the POS workflow.
-- Separate pages remain unavailable through route guards; POS sales remain scoped to the cashier.
DELETE FROM public.job_title_denials WHERE job_title = 'sales_person';
INSERT INTO public.job_title_denials(job_title, permission)
SELECT 'sales_person', p.permission
FROM public.business_permission_catalog p
WHERE p.permission NOT IN (
  'sales.create',
  'sales.view',
  'inventory.view',
  'categories.view',
  'customers.view',
  'customers.create'
)
ON CONFLICT DO NOTHING;

DELETE FROM public.business_access_role_permissions rp
USING public.business_access_roles r
WHERE rp.business_id = r.business_id
  AND rp.role_id = r.id
  AND r.code = 'position_sales_person';

INSERT INTO public.business_access_role_permissions(business_id, role_id, permission)
SELECT r.business_id, r.id, p.permission
FROM public.business_access_roles r
CROSS JOIN (VALUES
  ('sales.create'),
  ('sales.view'),
  ('inventory.view'),
  ('categories.view'),
  ('customers.view'),
  ('customers.create')
) AS p(permission)
WHERE r.code = 'position_sales_person' AND r.is_active
ON CONFLICT DO NOTHING;
