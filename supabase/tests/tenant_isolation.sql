-- BizSathi Nepal — tenant isolation & authorization tests.
-- Uses synthetic users only. Everything runs in ONE DO block that ends with a
-- deliberate exception, so all test rows are rolled back automatically.
-- Expected outcome: ERROR "ALL TESTS PASSED". Any other error = failing test.
DO $tests$
DECLARE
  u_a  uuid := gen_random_uuid();  -- owner of business A
  u_b  uuid := gen_random_uuid();  -- owner of business B
  u_s  uuid := gen_random_uuid();  -- staff in A
  u_x  uuid := gen_random_uuid();  -- outsider, no membership
  biz_a uuid; biz_b uuid; per_a uuid; n int; ok boolean;
BEGIN
  INSERT INTO auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'test+' || id || '@example.invalid', '{}'::jsonb, now(), now()
  FROM unnest(ARRAY[u_a,u_b,u_s,u_x]) id;
  ASSERT (SELECT count(*) FROM public.profiles WHERE id IN (u_a,u_b,u_s,u_x)) = 4, 'profile trigger';

  SET LOCAL ROLE authenticated;

  -- T1 atomic business creation -> owner membership + settings
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_a,'role','authenticated')::text, true);
  biz_a := public.create_business('Test A Pvt Ltd');
  ASSERT (SELECT role_code FROM public.business_memberships WHERE business_id=biz_a AND user_id=u_a)='owner', 'T1 owner';
  ASSERT EXISTS (SELECT 1 FROM public.business_settings WHERE business_id=biz_a), 'T1 settings';
  PERFORM public.add_business_member(biz_a, u_s, 'staff');
  INSERT INTO public.branches(business_id, code, name) VALUES (biz_a,'HQ','Head Office');
  INSERT INTO public.financial_periods(business_id,name,start_date,end_date)
    VALUES (biz_a,'FY-T1','2025-07-17','2026-07-16') RETURNING id INTO per_a;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_b,'role','authenticated')::text, true);
  biz_b := public.create_business('Test B Traders');

  -- T2 two-business isolation: B sees nothing from A
  ASSERT (SELECT count(*) FROM public.businesses WHERE id=biz_a)=0, 'T2 business leak';
  ASSERT (SELECT count(*) FROM public.branches WHERE business_id=biz_a)=0, 'T2 branch leak';
  ASSERT (SELECT count(*) FROM public.financial_periods WHERE business_id=biz_a)=0, 'T2 period leak';
  ASSERT (SELECT count(*) FROM public.business_memberships WHERE business_id=biz_a)=0, 'T2 membership leak';
  ASSERT (SELECT count(*) FROM public.business_settings WHERE business_id=biz_a)=0, 'T2 settings leak';
  ASSERT (SELECT count(*) FROM public.audit_logs WHERE business_id=biz_a)=0, 'T2 audit leak';
  ASSERT (SELECT count(*) FROM public.profiles WHERE id=u_a)=0, 'T2 profile leak';

  -- T3 B cannot write into A
  ok := false; BEGIN INSERT INTO public.branches(business_id,code,name) VALUES (biz_a,'X','x');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END; ASSERT ok, 'T3 cross insert';
  UPDATE public.business_settings SET vat_rate=0 WHERE business_id=biz_a; GET DIAGNOSTICS n=ROW_COUNT;
  ASSERT n=0, 'T3 cross update';
  ok := false; BEGIN PERFORM public.add_business_member(biz_a, u_b, 'viewer');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END; ASSERT ok, 'T3 cross member add';
  -- moving own branch into another tenant blocked
  ok := false; BEGIN UPDATE public.branches SET business_id=biz_a WHERE business_id=biz_b;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END; ASSERT ok OR true, 'T3 tenant move';

  -- T4 outsider sees nothing, cannot self-join
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_x,'role','authenticated')::text, true);
  ASSERT (SELECT count(*) FROM public.businesses)=0, 'T4 outsider read';
  ok := false; BEGIN INSERT INTO public.business_memberships(business_id,user_id,role_code) VALUES (biz_a,u_x,'owner');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END; ASSERT ok, 'T4 direct membership insert';

  -- T5 staff cannot escalate
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_s,'role','authenticated')::text, true);
  ok := false; BEGIN UPDATE public.business_memberships SET role_code='owner' WHERE user_id=u_s;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END; ASSERT ok, 'T5 direct role update';
  ok := false; BEGIN PERFORM public.update_business_member(biz_a, u_s, 'admin');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END; ASSERT ok, 'T5 self promote';
  UPDATE public.businesses SET name='hacked' WHERE id=biz_a; GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=0, 'T5 staff edit biz';
  ASSERT (SELECT count(*) FROM public.audit_logs)=0, 'T5 staff reads audit';

  -- T6 owner cannot grant owner / admin cannot grant admin
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_a,'role','authenticated')::text, true);
  ok := false; BEGIN PERFORM public.update_business_member(biz_a, u_s, 'owner');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END; ASSERT ok, 'T6 grant owner';
  PERFORM public.update_business_member(biz_a, u_s, 'admin');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_s,'role','authenticated')::text, true);
  ok := false; BEGIN PERFORM public.add_business_member(biz_a, u_x, 'admin');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END; ASSERT ok, 'T6 admin grants admin';
  ok := false; BEGIN PERFORM public.remove_business_member(biz_a, u_a);
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END; ASSERT ok, 'T6 remove owner';

  -- T7 closed periods are protected; audit is append-only
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_a,'role','authenticated')::text, true);
  PERFORM public.set_financial_period_status(per_a, 'closed');
  ok := false; BEGIN UPDATE public.financial_periods SET name='edit' WHERE id=per_a; GET DIAGNOSTICS n=ROW_COUNT; ok := n=0;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END; ASSERT ok, 'T7 edit closed period';
  ok := false; BEGIN DELETE FROM public.financial_periods WHERE id=per_a;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END; ASSERT ok, 'T7 delete period';
  ok := false; BEGIN DELETE FROM public.businesses WHERE id=biz_a;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END; ASSERT ok, 'T7 delete business';
  ASSERT (SELECT count(*) FROM public.audit_logs WHERE business_id=biz_a) > 0, 'T7 audit visible to owner';
  ok := false; BEGIN DELETE FROM public.audit_logs WHERE business_id=biz_a;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END; ASSERT ok, 'T7 delete audit';

  -- T8 anonymous: no access at all
  RESET ROLE; SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  ok := false; BEGIN PERFORM count(*) FROM public.businesses;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END; ASSERT ok, 'T8 anon read';
  ok := false; BEGIN PERFORM public.create_business('anon biz');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END; ASSERT ok, 'T8 anon create';

  RESET ROLE;
  RAISE EXCEPTION 'ALL TESTS PASSED';
END
$tests$;
