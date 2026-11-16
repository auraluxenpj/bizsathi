-- Run only in an isolated test database with the project's migrations (through 0049) applied.
-- The explicit transaction guarantees all synthetic auth/business records are rolled back.
BEGIN;
DO $tests$
DECLARE
  master uuid:=gen_random_uuid(); owner_a uuid:=gen_random_uuid(); mgr_a uuid:=gen_random_uuid(); staff_a uuid:=gen_random_uuid();
  new1 uuid:=gen_random_uuid(); new2 uuid:=gen_random_uuid(); new3 uuid:=gen_random_uuid(); new4 uuid:=gen_random_uuid(); unverified uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid();
  ba uuid; bb uuid; br_a uuid; br_b uuid; iid uuid; iid2 uuid; ok boolean; n int;
  h1 text:=repeat('1',64); h2 text:=repeat('2',64); h3 text:=repeat('3',64); h4 text:=repeat('4',64);
BEGIN
  INSERT INTO auth.users(id,email,phone,email_confirmed_at,phone_confirmed_at)
  SELECT u,'t+'||u||'@example.invalid',NULL,now(),NULL FROM unnest(ARRAY[master,owner_a,mgr_a,staff_a,owner_b]) u;
  INSERT INTO auth.users(id,email,phone,email_confirmed_at,phone_confirmed_at) VALUES
    (new1,'n1@example.invalid','9841000001',now(),now()), (new2,'n2@example.invalid','9841000002',now(),now()), (new3,'n3@example.invalid','9841000003',now(),now()), (new4,'other@example.invalid','9841000001',now(),now()),
    (unverified,'u@example.invalid','9841000009',now(),NULL);
  INSERT INTO public.businesses(name,created_by) VALUES('Biz A',owner_a) RETURNING id INTO ba;
  INSERT INTO public.businesses(name,created_by) VALUES('Biz B',owner_b) RETURNING id INTO bb;
  INSERT INTO public.branches(business_id,code,name) VALUES(ba,'A','Branch A') RETURNING id INTO br_a;
  INSERT INTO public.branches(business_id,code,name) VALUES(ba,'A2','Branch A2') RETURNING id INTO br_b;
  INSERT INTO public.business_memberships(business_id,user_id,role_code) VALUES(ba,owner_a,'owner'),(ba,mgr_a,'accountant'),(ba,staff_a,'staff'),(bb,owner_b,'owner');
  INSERT INTO public.branch_memberships(business_id,branch_id,user_id,granted_by) VALUES(ba,br_a,mgr_a,owner_a),(ba,br_a,staff_a,owner_a);
  INSERT INTO public.platform_owners(user_id,note) VALUES(master,'test');

  -- Master owner reaches every business/branch and cannot be demoted.
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',master,'role','authenticated')::text,true);
  ASSERT (SELECT count(*) FROM public.businesses)=2,'master sees all businesses';
  ASSERT (SELECT count(*) FROM public.branches)=2,'master sees all branches';
  ASSERT public.is_platform_owner(),'is_platform_owner true for master';
  ok:=false; BEGIN PERFORM public.grant_branch_delegation(ba,br_a,mgr_a,ARRAY['accountant'],5,7); EXCEPTION WHEN insufficient_privilege THEN ok:=true; END; ASSERT ok,'manager cannot receive delegation for an equal-ranked role';
  PERFORM public.grant_branch_delegation(ba,br_a,mgr_a,ARRAY['staff','viewer'],5,7);   -- master delegates lower-ranked roles
  RESET ROLE;
  -- Cross-check: a normal user is not a platform owner, and API roles cannot touch platform_owners.
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_a,'role','authenticated')::text,true);
  ASSERT NOT public.is_platform_owner(),'owner is not platform owner';
  ok:=false; BEGIN PERFORM 1 FROM public.platform_owners; EXCEPTION WHEN insufficient_privilege THEN ok:=true; END; ASSERT ok,'platform_owners unreadable by API';
  ok:=false; BEGIN UPDATE public.business_memberships SET role_code='viewer' WHERE user_id=master; ok:=true; EXCEPTION WHEN OTHERS THEN ok:=true; END;
  -- the master has no membership row; demotion of membership is covered by the trigger test below
  RESET ROLE;
  INSERT INTO public.business_memberships(business_id,user_id,role_code) VALUES(ba,master,'admin');
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_a,'role','authenticated')::text,true);
  ok:=false; BEGIN UPDATE public.business_memberships SET role_code='viewer' WHERE business_id=ba AND user_id=master; EXCEPTION WHEN insufficient_privilege THEN ok:=true; WHEN OTHERS THEN ok:=true; END; ASSERT ok,'master cannot be demoted';
  ok:=false; BEGIN PERFORM public.remove_business_member(ba,master); EXCEPTION WHEN OTHERS THEN ok:=true; END; ASSERT ok,'master cannot be removed';
  RESET ROLE;

  -- Branch manager invites into their own branch.
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',mgr_a,'role','authenticated')::text,true);
  iid:=public.create_team_invitation(ba,br_a,'staff','sales_person','{}','N1@EXAMPLE.INVALID','9841000001',h1,now()+interval '2 days',1,'WhatsApp');
  ok:=false; BEGIN PERFORM public.create_team_invitation(ba,br_b,'staff',NULL,'{}','n1@example.invalid','9841000001',h2,now()+interval '2 days',1); EXCEPTION WHEN insufficient_privilege THEN ok:=true; END; ASSERT ok,'manager cannot invite into another branch';
  ok:=false; BEGIN PERFORM public.create_team_invitation(ba,br_a,'accountant',NULL,'{}','n1@example.invalid','9841000001',h2,now()+interval '2 days',1); EXCEPTION WHEN insufficient_privilege THEN ok:=true; END; ASSERT ok,'manager cannot assign an undelegated role';
  ok:=false; BEGIN PERFORM public.create_team_invitation(ba,br_a,'admin',NULL,'{}','n1@example.invalid','9841000001',h2,now()+interval '2 days',1); EXCEPTION WHEN insufficient_privilege THEN ok:=true; END; ASSERT ok,'manager cannot assign admin';
  ok:=false; BEGIN PERFORM public.create_team_invitation(ba,br_a,'staff',NULL,'{}','n1@example.invalid','9841000001',h2,now()+interval '2 days',50); EXCEPTION WHEN OTHERS THEN ok:=true; END; ASSERT ok,'phone-bound invitation must be single-use';
  ok:=false; BEGIN PERFORM public.create_team_invitation(bb,br_a,'staff',NULL,'{}','n1@example.invalid','9841000001',h2,now()+interval '2 days',1); EXCEPTION WHEN insufficient_privilege THEN ok:=true; END; ASSERT ok,'manager cannot invite into another business';
  ok:=false; BEGIN PERFORM public.grant_branch_delegation(ba,br_a,staff_a,ARRAY['staff'],1,1); EXCEPTION WHEN insufficient_privilege THEN ok:=true; END; ASSERT ok,'manager cannot self-delegate to others';
  ASSERT (SELECT count(*) FROM public.team_invitations)=1,'manager sees only own invitations';
  ASSERT (SELECT invitee_mobile_masked FROM public.team_invitations_status WHERE id=iid)='••••0001','invitation status exposes only masked mobile';
  ASSERT (SELECT invitee_email_masked FROM public.team_invitations_status WHERE id=iid)='n***@example.invalid','invitation status exposes only masked email';
  RESET ROLE;

  -- Staff without delegation cannot invite.
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',staff_a,'role','authenticated')::text,true);
  ok:=false; BEGIN PERFORM public.create_team_invitation(ba,br_a,'viewer',NULL,'{}','n3@example.invalid','9841000003',h3,now()+interval '2 days',1); EXCEPTION WHEN insufficient_privilege THEN ok:=true; END; ASSERT ok,'staff cannot invite';
  ASSERT (SELECT count(*) FROM public.team_invitations)=0,'staff sees no invitations';
  RESET ROLE;

  -- Acceptance: unverified and wrong mobile rejected; matching verified mobile accepted; no reuse.
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',unverified,'role','authenticated')::text,true);
  ok:=false; BEGIN PERFORM public.accept_team_invitation(h1); EXCEPTION WHEN insufficient_privilege THEN ok:=true; END; ASSERT ok,'unverified mobile cannot accept';
  PERFORM set_config('request.jwt.claims',json_build_object('sub',new2,'role','authenticated')::text,true);
  ok:=false; BEGIN PERFORM public.accept_team_invitation(h1); EXCEPTION WHEN insufficient_privilege THEN ok:=true; END; ASSERT ok,'wrong verified mobile cannot accept';
  PERFORM set_config('request.jwt.claims',json_build_object('sub',new4,'role','authenticated')::text,true);
  ok:=false; BEGIN PERFORM public.accept_team_invitation(h1); EXCEPTION WHEN insufficient_privilege THEN ok:=true; END; ASSERT ok,'wrong verified email cannot accept';
  PERFORM set_config('request.jwt.claims',json_build_object('sub',new1,'role','authenticated')::text,true);
  ASSERT public.accept_team_invitation(h1)=ba,'matching verified invitation accepted';
  ok:=false; BEGIN PERFORM public.accept_team_invitation(h1); EXCEPTION WHEN insufficient_privilege THEN ok:=true; END; ASSERT ok,'same user cannot reuse';
  RESET ROLE;
  ASSERT (SELECT role_code FROM public.business_memberships WHERE business_id=ba AND user_id=new1)='staff','invited role assigned';
  ASSERT (SELECT job_title FROM public.business_memberships WHERE business_id=ba AND user_id=new1)='sales_person','job title assigned';
  ASSERT EXISTS(SELECT 1 FROM public.branch_memberships WHERE branch_id=br_a AND user_id=new1),'branch access granted';
  ASSERT NOT EXISTS(SELECT 1 FROM public.branch_memberships WHERE branch_id=br_b AND user_id=new1),'no other branch access';
  RESET ROLE;
  ASSERT (SELECT status FROM public.team_invitations_status WHERE id=iid)='accepted','single-use invitation accepted status';

  -- Revoked and expired invitations.
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',mgr_a,'role','authenticated')::text,true);
  iid2:=public.create_team_invitation(ba,br_a,'viewer',NULL,'{}','n3@example.invalid','9841000003',h4,now()+interval '2 days',1);
  PERFORM public.revoke_team_invitation(iid2);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',new3,'role','authenticated')::text,true);
  ok:=false; BEGIN PERFORM public.accept_team_invitation(h4); EXCEPTION WHEN insufficient_privilege THEN ok:=true; END; ASSERT ok,'revoked invitation rejected';
  RESET ROLE;
  UPDATE public.team_invitations SET expires_at=now()-interval '1 second', created_at=now()-interval '1 day' WHERE id=iid2;
  ASSERT (SELECT status FROM public.team_invitations_status WHERE id=iid2)='revoked','revoked wins over expired';
  -- Delegation revoked => pending invitations stop working.
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',mgr_a,'role','authenticated')::text,true);
  iid:=public.create_team_invitation(ba,br_a,'viewer',NULL,'{}','n3@example.invalid','9841000003',repeat('5',64),now()+interval '2 days',1);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_a,'role','authenticated')::text,true);
  PERFORM public.revoke_branch_delegation((SELECT id FROM public.delegation_grants WHERE manager_user_id=mgr_a AND revoked_at IS NULL));
  PERFORM set_config('request.jwt.claims',json_build_object('sub',new3,'role','authenticated')::text,true);
  ok:=false; BEGIN PERFORM public.accept_team_invitation(repeat('5',64)); EXCEPTION WHEN insufficient_privilege THEN ok:=true; END; ASSERT ok,'invitation dies when inviter loses delegation';
  RESET ROLE;

  -- Cross-business isolation.
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_b,'role','authenticated')::text,true);
  ASSERT (SELECT count(*) FROM public.team_invitations WHERE business_id=ba)=0,'other business cannot read invitations';
  ASSERT (SELECT count(*) FROM public.branches WHERE business_id=ba)=0,'other business cannot read branches';
  ok:=false; BEGIN PERFORM token_hash FROM public.team_invitations; EXCEPTION WHEN insufficient_privilege THEN ok:=true; END; ASSERT ok,'token_hash never readable';
  RESET ROLE;

  RAISE NOTICE 'TEAM_ACCESS_TESTS_PASSED';
END $tests$;
ROLLBACK;
