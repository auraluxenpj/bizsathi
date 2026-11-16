-- Stage 1 ownership-boundary regression tests.
-- Run only in an isolated test database with migrations through 0057 applied.
-- All synthetic records are rolled back.
BEGIN;
DO $tests$
DECLARE
  business_owner uuid := gen_random_uuid();
  new_owner uuid := gen_random_uuid();
  master_owner uuid := gen_random_uuid();
  v_business_id uuid;
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  SELECT u,'owner-boundary+'||u||'@example.invalid',now(),'{}'::jsonb,now(),now()
  FROM unnest(ARRAY[business_owner,new_owner,master_owner]) u;

  INSERT INTO public.platform_owners(user_id,note)
  VALUES (master_owner,'synthetic Stage 1 regression test');

  -- Seed synthetic business and memberships as the disposable database owner.
  -- Migration 0041 intentionally disables the application create_business RPC.
  INSERT INTO public.businesses(name,created_by)
  VALUES ('Synthetic ownership boundary',business_owner)
  RETURNING id INTO v_business_id;
  INSERT INTO public.business_memberships(business_id,user_id,role_code,status)
  VALUES
    (v_business_id,business_owner,'owner','active'),
    (v_business_id,new_owner,'admin','active'),
    (v_business_id,master_owner,'admin','active');

  -- Check the private rank helper as the disposable database owner.
  -- Do not grant authenticated users EXECUTE merely for this test assertion.
  ASSERT public.business_role_rank(v_business_id,master_owner)=100,
    'Master Owner retains global rank 100 for business oversight';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',business_owner,'role','authenticated')::text,true);

  -- Master Owner has global rank 100, but that rank must not authorize a
  -- business-level ownership transfer.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',master_owner,'role','authenticated')::text,true);
  rejected := false;
  BEGIN
    PERFORM public.transfer_business_ownership(v_business_id,new_owner);
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  ASSERT rejected,'Master Owner cannot transfer another business ownership';

  -- The actual Business Owner can transfer ownership to an active, non-platform member.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',business_owner,'role','authenticated')::text,true);
  rejected := false;
  BEGIN
    PERFORM public.transfer_business_ownership(v_business_id,master_owner);
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  ASSERT rejected,'Business Owner cannot assign business ownership to the platform Master Owner';

  PERFORM public.transfer_business_ownership(v_business_id,new_owner);
  ASSERT (SELECT m.role_code FROM public.business_memberships m
          WHERE m.business_id=v_business_id AND m.user_id=new_owner)='owner',
    'Active target becomes Business Owner';
  ASSERT (SELECT m.role_code FROM public.business_memberships m
          WHERE m.business_id=v_business_id AND m.user_id=business_owner)='admin',
    'Previous Business Owner becomes Admin';

  -- Former Business Owner is no longer allowed to transfer ownership.
  rejected := false;
  BEGIN
    PERFORM public.transfer_business_ownership(v_business_id,business_owner);
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  ASSERT rejected,'Former Business Owner cannot transfer ownership after transfer';

  RAISE NOTICE 'STAGE1_OWNERSHIP_BOUNDARY_TESTS_PASSED';
END;
$tests$;
ROLLBACK;
