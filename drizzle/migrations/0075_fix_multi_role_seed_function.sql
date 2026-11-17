-- 0075: fix the role-seeding loop variable in the multi-role foundation.
-- This is a no-data-loss replacement; it is safe after 0074 has been applied.
CREATE OR REPLACE FUNCTION public.seed_business_access_roles(_business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id=_business_id) THEN
    RAISE EXCEPTION 'Business unavailable';
  END IF;

  INSERT INTO public.business_access_roles(business_id,code,name,description,authority_rank,is_system)
  SELECT _business_id,'legacy_'||role_row.code,role_row.name,
         'Compatibility role migrated from the existing business membership role.',
         role_row.rank,true
  FROM public.roles role_row
  ON CONFLICT (business_id,code) DO NOTHING;

  FOR v_item IN
    SELECT x.job_title, public.job_title_role(x.job_title) AS base_role,
           CASE x.job_title
             WHEN 'partner' THEN 'Partner'
             WHEN 'manager' THEN 'Manager'
             WHEN 'branch_manager' THEN 'Branch Manager'
             WHEN 'accountant' THEN 'Accountant'
             WHEN 'sales_person' THEN 'Sales Person'
             WHEN 'stock_manager' THEN 'Stock Manager'
             WHEN 'entry_person' THEN 'Entry Person'
           END AS role_name
    FROM (VALUES ('partner'),('manager'),('branch_manager'),('accountant'),
                 ('sales_person'),('stock_manager'),('entry_person')) AS x(job_title)
  LOOP
    INSERT INTO public.business_access_roles(business_id,code,name,description,authority_rank,is_system)
    SELECT _business_id,'position_'||v_item.job_title,v_item.role_name,
           'Compatibility role seeded from the existing position permission template.',
           1::smallint,true
    FROM public.roles gr
    WHERE gr.code=v_item.base_role
    ON CONFLICT (business_id,code) DO NOTHING;
  END LOOP;

  -- Legacy role grants preserve the existing role preset ceilings.
  FOR v_item IN
    SELECT br.id, br.code,
      CASE br.code
        WHEN 'legacy_owner' THEN ARRAY[]::text[]
        WHEN 'legacy_admin' THEN ARRAY['settings.delete_business']::text[]
        WHEN 'legacy_accountant' THEN ARRAY(SELECT d.permission FROM public.job_title_denials d WHERE d.job_title='accountant')
        WHEN 'legacy_branch_manager' THEN ARRAY(SELECT d.permission FROM public.job_title_denials d WHERE d.job_title='branch_manager')
        WHEN 'legacy_staff' THEN ARRAY(SELECT d.permission FROM public.job_title_denials d WHERE d.job_title='sales_person')
        WHEN 'legacy_viewer' THEN ARRAY(
          SELECT p.permission FROM public.business_permission_catalog p
          WHERE NOT (p.permission ~ '\.view$' OR p.permission='reports.home_stats')
             OR p.permission IN ('staff.view','accounts.view','reports.view')
        )
        ELSE ARRAY[]::text[]
      END AS denied
    FROM public.business_access_roles br
    WHERE br.business_id=_business_id AND br.code LIKE 'legacy_%'
  LOOP
    INSERT INTO public.business_access_role_permissions(business_id,role_id,permission)
    SELECT _business_id,v_item.id,p.permission
    FROM public.business_permission_catalog p
    WHERE NOT (p.permission = ANY(v_item.denied))
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Position roles inherit the business-specific template when present; otherwise
  -- they inherit the existing global job-title denial template.
  FOR v_item IN
    SELECT br.id, substring(br.code from 10) AS job_title,
      COALESCE(t.denied_permissions,
        ARRAY(SELECT d.permission FROM public.job_title_denials d WHERE d.job_title=substring(br.code from 10))
      ) AS denied
    FROM public.business_access_roles br
    LEFT JOIN public.business_role_templates t
      ON t.business_id=br.business_id AND t.job_title=substring(br.code from 10)
    WHERE br.business_id=_business_id AND br.code LIKE 'position_%'
  LOOP
    INSERT INTO public.business_access_role_permissions(business_id,role_id,permission)
    SELECT _business_id,v_item.id,p.permission
    FROM public.business_permission_catalog p
    WHERE NOT (p.permission = ANY(v_item.denied))
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_business_access_roles(uuid) FROM PUBLIC,anon,authenticated;
