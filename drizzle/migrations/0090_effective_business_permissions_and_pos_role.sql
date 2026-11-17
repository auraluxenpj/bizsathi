-- 0090: resolve the signed-in member's effective permissions for fail-closed navigation.
-- The permission catalogue is non-sensitive metadata; authenticated users can read it.
GRANT SELECT ON public.business_permission_catalog TO authenticated;
DROP POLICY IF EXISTS business_permission_catalog_read ON public.business_permission_catalog;
CREATE POLICY business_permission_catalog_read ON public.business_permission_catalog
FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.get_my_business_permissions(_business uuid)
RETURNS TABLE(permission text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT c.permission
  FROM public.business_permission_catalog c
  WHERE auth.uid() IS NOT NULL
    AND COALESCE(public.business_role_rank(_business, auth.uid()), 0) > 0
    AND public.has_permission(_business, c.permission)
  ORDER BY c.permission;
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
SET search_path = ''
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

-- Normalize existing default assignments to the invitation's base access role.
-- Preserve every additional (non-default) access role assigned by an administrator.
DO $align_existing_base_roles$
DECLARE
  a record;
  target_role uuid;
BEGIN
  FOR a IN
    SELECT assignment.business_id, assignment.user_id, assignment.role_id,
           assignment.assigned_by, membership.role_code
    FROM public.business_member_access_roles assignment
    JOIN public.business_access_roles current_role
      ON current_role.business_id=assignment.business_id
     AND current_role.id=assignment.role_id
    JOIN public.business_memberships membership
      ON membership.business_id=assignment.business_id
     AND membership.user_id=assignment.user_id
     AND membership.status='active'
    WHERE assignment.is_default AND current_role.code LIKE 'position_%'
  LOOP
    SELECT id INTO target_role
    FROM public.business_access_roles
    WHERE business_id=a.business_id
      AND code='legacy_'||a.role_code
      AND is_active;

    IF target_role IS NULL THEN
      RAISE EXCEPTION 'Missing base access role legacy_% for business %',a.role_code,a.business_id;
    END IF;

    DELETE FROM public.business_member_access_roles
    WHERE business_id=a.business_id AND user_id=a.user_id AND role_id=a.role_id;

    INSERT INTO public.business_member_access_roles
      (business_id,user_id,role_id,assigned_by,is_default)
    VALUES (a.business_id,a.user_id,target_role,a.assigned_by,true)
    ON CONFLICT (business_id,user_id,role_id)
    DO UPDATE SET is_default=true,assigned_at=now();

    INSERT INTO public.audit_logs
      (business_id,actor_id,action,entity_table,entity_id,old_data,new_data)
    VALUES
      (a.business_id,NULL,'access_role.base_alignment','business_member_access_roles',a.user_id::text,
       jsonb_build_object('role_id',a.role_id,'source','position_default'),
       jsonb_build_object('role_id',target_role,'source','base_access_role','base_role_code',a.role_code));
  END LOOP;
END;
$align_existing_base_roles$;

-- Ensure invitation status reads inherit the underlying team_invitations RLS policy.
CREATE OR REPLACE VIEW public.team_invitations_status
WITH (security_invoker = true)
AS
SELECT id,
       business_id,
       branch_id,
       role_code,
       job_title,
       label,
       invited_by,
       expires_at,
       max_uses,
       use_count,
       revoked_at,
       created_at,
       CASE
         WHEN revoked_at IS NOT NULL THEN 'revoked'::text
         WHEN use_count >= max_uses THEN 'accepted'::text
         WHEN expires_at <= now() THEN 'expired'::text
         WHEN use_count > 0 THEN 'partially_used'::text
         ELSE 'pending'::text
       END AS status
FROM public.team_invitations;

-- Read policies follow the same module permissions as navigation. POS retains only
-- the product/customer/stock lookups required inside its own checkout workspace.
DROP POLICY IF EXISTS products_read ON public.products;
CREATE POLICY products_read ON public.products
FOR SELECT TO authenticated
USING (
  public.is_business_member(business_id)
  AND public.has_permission(business_id,'inventory.view')
);

DROP POLICY IF EXISTS variants_read ON public.product_variants;
CREATE POLICY variants_read ON public.product_variants
FOR SELECT TO authenticated
USING (
  public.is_business_member(business_id)
  AND public.has_permission(business_id,'inventory.view')
);

DROP POLICY IF EXISTS parties_read ON public.parties;
CREATE POLICY parties_read ON public.parties
FOR SELECT TO authenticated
USING (
  public.is_business_member(business_id)
  AND CASE WHEN kind='customer'
    THEN public.has_permission(business_id,'customers.view')
    ELSE public.has_permission(business_id,'suppliers.view')
  END
);

DROP POLICY IF EXISTS stock_read ON public.stock_movements;
CREATE POLICY stock_read ON public.stock_movements
FOR SELECT TO authenticated
USING (
  public.can_access_branch(business_id,branch_id)
  AND public.has_permission(business_id,'inventory.view')
);

DROP POLICY IF EXISTS commerce_stock_read ON public.commerce_stock_movements;
CREATE POLICY commerce_stock_read ON public.commerce_stock_movements
FOR SELECT TO authenticated
USING (
  public.can_access_branch(business_id,branch_id)
  AND public.has_permission(business_id,'inventory.view')
);
