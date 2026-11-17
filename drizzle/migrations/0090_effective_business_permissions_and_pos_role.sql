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

-- Base Staff is the least-privilege POS baseline. HR position must not grant permissions.
DELETE FROM public.business_access_role_permissions rp
USING public.business_access_roles r
WHERE rp.business_id = r.business_id
  AND rp.role_id = r.id
  AND r.code IN ('legacy_staff','position_sales_person');

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
WHERE r.code IN ('legacy_staff','position_sales_person') AND r.is_active
ON CONFLICT DO NOTHING;

-- Invitation's base access role controls the default permission bundle.
-- HR position is stored only as a designation and never auto-grants application permissions.
CREATE OR REPLACE FUNCTION public.sync_default_business_access_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $sync_default_access_role$
DECLARE
  v_role_id uuid;
  v_role_code text;
  v_has_default boolean := false;
BEGIN
  IF current_setting('bizsathi.skip_access_role_sync',true)='on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP='UPDATE' THEN
    SELECT true INTO v_has_default
    FROM public.business_member_access_roles
    WHERE business_id=NEW.business_id AND user_id=NEW.user_id AND is_default
    LIMIT 1;
    IF NOT COALESCE(v_has_default,false) THEN
      RETURN NEW;
    END IF;
  END IF;

  v_role_code := 'legacy_' || NEW.role_code;
  SELECT id INTO v_role_id
  FROM public.business_access_roles
  WHERE business_id=NEW.business_id AND code=v_role_code AND is_active;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Default access role is not configured for this membership';
  END IF;

  DELETE FROM public.business_member_access_roles
  WHERE business_id=NEW.business_id AND user_id=NEW.user_id AND is_default;

  INSERT INTO public.business_member_access_roles
    (business_id,user_id,role_id,assigned_by,is_default)
  VALUES (NEW.business_id,NEW.user_id,v_role_id,NEW.invited_by,true)
  ON CONFLICT (business_id,user_id,role_id)
  DO UPDATE SET is_default=true,assigned_by=EXCLUDED.assigned_by,assigned_at=now();

  RETURN NEW;
END;
$sync_default_access_role$;
REVOKE ALL ON FUNCTION public.sync_default_business_access_role() FROM PUBLIC,anon,authenticated;
