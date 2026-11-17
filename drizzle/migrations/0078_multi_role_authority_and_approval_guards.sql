-- 0078: complete multi-role permission and authority resolver cutover.
-- Existing membership role_code remains a compatibility authority floor; assigned
-- built-in access roles may add authority, while custom permission roles remain rank 1.
CREATE OR REPLACE FUNCTION public.create_business_access_role(
  _business uuid,_name text,_description text,_authority_rank smallint,_permissions text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_rank smallint;
  new_id uuid;
  role_code text;
  p text;
BEGIN
  actor_rank := public.business_role_rank(_business,auth.uid());
  IF auth.uid() IS NULL OR actor_rank IS NULL OR actor_rank<80 THEN
    RAISE EXCEPTION 'Administrator access is required' USING ERRCODE='42501';
  END IF;
  IF _authority_rank IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Custom permission roles cannot elevate business authority' USING ERRCODE='42501';
  END IF;
  IF _name IS NULL OR char_length(btrim(_name)) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Role name must contain 2 to 80 characters';
  END IF;
  IF cardinality(COALESCE(_permissions,'{}'))>200 THEN RAISE EXCEPTION 'Too many permissions'; END IF;
  FOREACH p IN ARRAY COALESCE(_permissions,'{}') LOOP
    IF NOT EXISTS(SELECT 1 FROM public.business_permission_catalog WHERE permission=p) THEN
      RAISE EXCEPTION 'Unknown permission: %',p;
    END IF;
    IF NOT public.has_permission(_business,p) THEN
      RAISE EXCEPTION 'You cannot delegate a permission you do not have' USING ERRCODE='42501';
    END IF;
  END LOOP;

  role_code := 'custom_'||replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.business_access_roles(business_id,code,name,description,authority_rank,is_system,created_by)
  VALUES (_business,role_code,btrim(_name),NULLIF(btrim(COALESCE(_description,'')),''),_authority_rank,false,auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO public.business_access_role_permissions(business_id,role_id,permission)
  SELECT _business,new_id,permission_code FROM unnest(COALESCE(_permissions,'{}')) AS permission_code
  ON CONFLICT DO NOTHING;

  PERFORM public.write_audit(_business,'access_role.create','business_access_roles',new_id::text,NULL,
    jsonb_build_object('name',btrim(_name),'authority_rank',_authority_rank,'permissions',to_jsonb(COALESCE(_permissions,'{}'))));
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_business_access_role(uuid,text,text,smallint,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_business_access_role(uuid,text,text,smallint,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_permission(_business uuid,_perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $multi_role_permission$
  SELECT auth.uid() IS NULL
    OR public.platform_owner_check(auth.uid())
    OR (
      COALESCE(public.business_role_rank(_business,auth.uid()),0)>0
      AND NOT EXISTS (
        SELECT 1 FROM public.member_permission_denials d
        WHERE d.business_id=_business AND d.user_id=auth.uid() AND d.permission=_perm
      )
      AND EXISTS (
        SELECT 1
        FROM public.business_member_access_roles a
        JOIN public.business_access_roles r
          ON r.business_id=a.business_id AND r.id=a.role_id AND r.is_active
        JOIN public.business_access_role_permissions rp
          ON rp.business_id=a.business_id AND rp.role_id=a.role_id
        WHERE a.business_id=_business AND a.user_id=auth.uid()
          AND rp.permission=_perm
      )
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.business_member_access_roles a
          JOIN public.business_access_roles r
            ON r.business_id=a.business_id AND r.id=a.role_id AND r.is_active
          WHERE a.business_id=_business AND a.user_id=auth.uid()
            AND r.code IN ('position_branch_manager','legacy_branch_manager')
        )
        OR COALESCE(public.business_role_rank(_business,auth.uid()),0)>50
        OR _perm = ANY (ARRAY[
          'sales.view','expenses.view','inventory.view','categories.view',
          'stock.create','stock.edit','customers.view','suppliers.view','staff.view',
          'reports.view','reports.home_stats','reports.expenses','reports.items','reports.parties','reports.transactions'
        ]::text[])
      )
    )
$multi_role_permission$;
REVOKE ALL ON FUNCTION public.has_permission(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.business_role_rank(_business_id uuid,_user_id uuid DEFAULT auth.uid())
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $multi_role_rank$
  SELECT CASE
    WHEN public.platform_owner_check(_user_id) THEN
      (SELECT 100::smallint FROM public.businesses b WHERE b.id=_business_id AND b.archived_at IS NULL)
    ELSE (
      SELECT GREATEST(r.rank,COALESCE(MAX(ar.authority_rank),0))::smallint
      FROM public.business_memberships m
      JOIN public.businesses b ON b.id=m.business_id AND b.archived_at IS NULL
      JOIN public.roles r ON r.code=m.role_code
      LEFT JOIN public.business_member_access_roles a
        ON a.business_id=m.business_id AND a.user_id=m.user_id
      LEFT JOIN public.business_access_roles ar
        ON ar.business_id=a.business_id AND ar.id=a.role_id AND ar.is_active
      WHERE m.business_id=_business_id AND m.user_id=_user_id
        AND m.status='active' AND _user_id IS NOT NULL
      GROUP BY r.rank
    )
  END
$multi_role_rank$;
REVOKE ALL ON FUNCTION public.business_role_rank(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_role_rank(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.has_business_access_role(_business uuid,_role_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $has_business_access_role$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.business_member_access_roles a
    JOIN public.business_access_roles r
      ON r.business_id=a.business_id AND r.id=a.role_id AND r.is_active
    JOIN public.business_memberships m
      ON m.business_id=a.business_id AND m.user_id=a.user_id AND m.status='active'
    WHERE a.business_id=_business AND a.user_id=auth.uid() AND r.code=_role_code
  )
$has_business_access_role$;
REVOKE ALL ON FUNCTION public.has_business_access_role(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_business_access_role(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_approve_inventory_count(_business_id uuid,_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $multi_role_count_approval$
  SELECT auth.uid() IS NOT NULL
    AND public.can_access_branch(_business_id,_branch_id)
    AND (
      public.has_business_role(_business_id,'admin')
      OR (
        (public.has_business_access_role(_business_id,'position_branch_manager')
         OR public.has_business_access_role(_business_id,'legacy_branch_manager'))
        AND public.has_permission(_business_id,'stock.edit')
      )
    )
$multi_role_count_approval$;
REVOKE ALL ON FUNCTION public.can_approve_inventory_count(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_approve_inventory_count(uuid,uuid) TO authenticated,service_role;
