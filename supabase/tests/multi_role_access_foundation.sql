-- Run on an isolated staging database after migration 0074.
-- All fixture writes are rolled back; this verifies the additive Phase A model only.
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

  ASSERT owner_default='legacy_owner','Existing owner membership gets a compatibility access role';
  ASSERT staff_default='position_sales_person','Existing employee position maps to the equivalent access template';
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
    v_business_id,'Stock + Sales','Custom combined duties',40,ARRAY['sales.create','inventory.view']
  );
  PERFORM public.assign_business_access_role(v_business_id,staff_id,custom_role_id);
  SELECT count(*) INTO assignments FROM public.business_member_access_roles
  WHERE business_id=v_business_id AND user_id=staff_id;
  ASSERT assignments=2,'An employee can hold more than one business role';
  PERFORM public.unassign_business_access_role(v_business_id,staff_id,custom_role_id);
  SELECT count(*) INTO assignments FROM public.business_member_access_roles
  WHERE business_id=v_business_id AND user_id=staff_id;
  ASSERT assignments=1,'Removing an additional role preserves the default compatibility role';
  RESET ROLE;

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.branch_memberships WHERE business_id=v_business_id
  ),'Role assignment does not create branch membership';
  ASSERT (SELECT count(*) FROM public.business_memberships WHERE business_id=v_business_id)=2,
    'Original business memberships remain intact';
  RAISE NOTICE 'MULTI_ROLE_ACCESS_FOUNDATION_TESTS_PASSED';
END
$tests$;
ROLLBACK;
