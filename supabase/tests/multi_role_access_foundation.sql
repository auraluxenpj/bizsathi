-- Run on an isolated staging database after migration 0076.
-- All fixture writes are rolled back; validates role union and deny precedence.
BEGIN;
DO $tests$
DECLARE
  owner_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  v_business_id uuid;
  custom_role_id uuid;
  owner_default text;
  staff_default text;
  assignments integer;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at)
  VALUES
    (owner_id,'multi-role-owner@example.invalid',now()),
    (staff_id,'multi-role-staff@example.invalid',now());

  INSERT INTO public.businesses(name,created_by)
  VALUES ('Multi-role access foundation test',owner_id)
  RETURNING id INTO v_business_id;

  INSERT INTO public.business_memberships(business_id,user_id,role_code,job_title)
  VALUES
    (v_business_id,owner_id,'owner',NULL),
    (v_business_id,staff_id,'staff','sales_person');

  SELECT r.code INTO owner_default
  FROM public.business_member_access_roles a
  JOIN public.business_access_roles r ON r.business_id=a.business_id AND r.id=a.role_id
  WHERE a.business_id=v_business_id AND a.user_id=owner_id AND a.is_default;

  SELECT r.code INTO staff_default
  FROM public.business_member_access_roles a
  JOIN public.business_access_roles r ON r.business_id=a.business_id AND r.id=a.role_id
  WHERE a.business_id=v_business_id AND a.user_id=staff_id AND a.is_default;

  ASSERT owner_default='legacy_owner','Owner gets the compatibility permission bundle';
  ASSERT staff_default='position_sales_person','Employee position maps to the existing permission template';
  ASSERT EXISTS (
    SELECT 1 FROM public.business_access_role_permissions rp
    JOIN public.business_access_roles r ON r.id=rp.role_id AND r.business_id=rp.business_id
    WHERE r.business_id=v_business_id AND r.code='position_sales_person' AND rp.permission='sales.create'
  ),'Sales Person default grants sale creation';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.business_access_role_permissions rp
    JOIN public.business_access_roles r ON r.id=rp.role_id AND r.business_id=rp.business_id
    WHERE r.business_id=v_business_id AND r.code='position_sales_person' AND rp.permission='settings.delete_business'
  ),'Sales Person default does not grant destructive business settings';
  ASSERT (SELECT count(*) FROM public.business_permission_catalog)>=77,
    'Canonical permission catalogue includes application permissions';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  custom_role_id := public.create_business_access_role(
    v_business_id,'Stock + Purchase','Custom combined duties',40::smallint,ARRAY['purchases.view','inventory.view']
  );
  PERFORM public.assign_business_access_role(v_business_id,staff_id,custom_role_id);
  RESET ROLE;

  SELECT count(*) INTO assignments FROM public.business_member_access_roles
  WHERE business_id=v_business_id AND user_id=staff_id;
  ASSERT assignments=2,'An employee can hold more than one business role';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',staff_id,'role','authenticated')::text,true);
  ASSERT public.has_permission(v_business_id,'sales.create'),'The employee retains their original permission';
  ASSERT public.has_permission(v_business_id,'purchases.view'),'The additional role adds its permission';
  ASSERT NOT public.has_permission(v_business_id,'settings.delete_business'),'The combined roles do not grant unrelated destructive permissions';
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM public.set_member_permissions(v_business_id,staff_id,ARRAY['purchases.view']);
  PERFORM public.set_member_job_title(v_business_id,staff_id,'stock_manager');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',staff_id,'role','authenticated')::text,true);
  ASSERT NOT public.has_permission(v_business_id,'purchases.view'),'An explicit employee denial overrides grants from every role';
  ASSERT public.has_permission(v_business_id,'sales.create'),'The employee keeps permissions granted by the remaining role';
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM public.unassign_business_access_role(v_business_id,staff_id,custom_role_id);
  RESET ROLE;

  SELECT count(*) INTO assignments FROM public.business_member_access_roles
  WHERE business_id=v_business_id AND user_id=staff_id;
  ASSERT assignments=1,'Removing an additional role preserves the default compatibility role';
  ASSERT (
    SELECT r.code FROM public.business_member_access_roles a
    JOIN public.business_access_roles r ON r.id=a.role_id AND r.business_id=a.business_id
    WHERE a.business_id=v_business_id AND a.user_id=staff_id AND a.is_default
  )='position_sales_person','Changing an HR designation does not silently change access roles';
  ASSERT public.business_role_rank(v_business_id,staff_id)=40,'Custom permission roles do not elevate the legacy security rank';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.branch_memberships WHERE business_id=v_business_id
  ),'Role assignment does not create branch membership';
  ASSERT (SELECT count(*) FROM public.business_memberships WHERE business_id=v_business_id)=2,
    'Original business memberships remain intact';

  RAISE NOTICE 'MULTI_ROLE_ACCESS_FOUNDATION_TESTS_PASSED';
END
$tests$;
ROLLBACK;
