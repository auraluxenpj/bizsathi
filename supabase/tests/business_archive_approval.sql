-- Isolated disposable PostgreSQL only. All synthetic users, requests and archive changes roll back.
BEGIN;
DO $test$
DECLARE
  owner_id uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  master_id uuid := gen_random_uuid();
  v_business_id uuid;
  request_id uuid;
  denied boolean;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  SELECT u,'archive-test+'||u||'@example.invalid',now(),'{}'::jsonb,now(),now()
  FROM unnest(ARRAY[owner_id,admin_id,master_id]) u;
  INSERT INTO public.platform_owners(user_id,note)
  VALUES (master_id,'synthetic archive approval regression test');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  v_business_id := public.create_business('Synthetic archive approval');
  PERFORM public.add_business_member(v_business_id,admin_id,'admin');

  -- Only the actual Business Owner can request archiving.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',admin_id,'role','authenticated')::text,true);
  denied := false;
  BEGIN
    PERFORM public.request_business_archive(v_business_id,'Admin should not archive');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  ASSERT denied,'Admin cannot request business archiving';

  PERFORM set_config('request.jwt.claims',json_build_object('sub',master_id,'role','authenticated')::text,true);
  denied := false;
  BEGIN
    PERFORM public.request_business_archive(v_business_id,'Master owner is not the business owner');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  ASSERT denied,'Master Owner cannot submit an ordinary business-owner request';

  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  request_id := public.request_business_archive(v_business_id,'Business is being closed permanently');
  ASSERT (SELECT status FROM public.list_business_archive_requests(v_business_id) WHERE id=request_id)='pending',
    'Owner request is pending';
  ASSERT (SELECT archived_at IS NULL FROM public.businesses WHERE id=v_business_id),
    'Request alone does not archive the business';

  -- A normal business owner cannot approve their own request.
  denied := false;
  BEGIN
    PERFORM public.review_business_archive_request(request_id,true,'self approval');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  ASSERT denied,'Business Owner cannot approve an archive request';

  -- Only Master Owner can approve; approval archives and writes a final status.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',master_id,'role','authenticated')::text,true);
  ASSERT (SELECT count(*) FROM public.list_business_archive_requests(v_business_id) WHERE status='pending')=1,
    'Master Owner can see pending request';
  PERFORM public.review_business_archive_request(request_id,true,'Verified by platform owner');
  ASSERT (SELECT status FROM public.list_business_archive_requests(v_business_id) WHERE id=request_id)='approved',
    'Request becomes approved';
  -- The old one-step RPC is no longer executable by authenticated users.
  denied := false;
  BEGIN
    PERFORM public.archive_business(v_business_id);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  ASSERT denied,'Legacy direct archive RPC is revoked';

  -- Inspect final persisted state as the isolated test database owner (bypasses tenant RLS).
  RESET ROLE;
  ASSERT (SELECT archived_at IS NOT NULL FROM public.businesses WHERE id=v_business_id),
    'Approval archives the business';
  ASSERT (SELECT count(*) FROM public.audit_logs al
          WHERE al.business_id=v_business_id AND al.entity_table='business_archive_requests') >= 2,
    'Request and review are audited';

  RAISE NOTICE 'BUSINESS_ARCHIVE_APPROVAL_TESTS_PASSED';
END;
$test$;
ROLLBACK;
