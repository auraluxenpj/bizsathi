-- Run only in an isolated test database with the project's migrations applied.
-- Deliberate final exception rolls back all synthetic test records.
DO $tests$
DECLARE
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); invited uuid:=gen_random_uuid(); administrator uuid:=gen_random_uuid();
 ba uuid; bb uuid; branch_a uuid; branch_b uuid; iid uuid; finding uuid; rejected boolean;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
 SELECT u,'test+'||u||'@example.invalid',now(),'{}'::jsonb,now(),now() FROM unnest(ARRAY[a,b,staff,outsider,invited,administrator]) u;
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 ba:=public.create_business('Isolated A');
 PERFORM public.add_business_member(ba,staff,'staff'); PERFORM public.add_business_member(ba,administrator,'admin');
 INSERT INTO public.branches(business_id,code,name) VALUES(ba,'A','A') RETURNING id INTO branch_a;
 INSERT INTO public.security_review_events(business_id,kind,title,details) VALUES(ba,'finding','Synthetic finding','Only isolated test data') RETURNING id INTO finding;
 iid:=public.create_business_invitation(ba,'test+'||invited||'@example.invalid','staff',repeat('a',64));
 rejected:=false; BEGIN PERFORM public.create_business_invitation(ba,'x@example.invalid','owner',repeat('b',64)); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'owner invitation denied';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
 bb:=public.create_business('Isolated B'); INSERT INTO public.branches(business_id,code,name) VALUES(bb,'B','B') RETURNING id INTO branch_b;
 ASSERT (SELECT count(*) FROM public.security_review_events WHERE business_id=ba)=0,'cross-business review read denied';
 ASSERT (SELECT count(id) FROM public.business_invitations WHERE business_id=ba)=0,'cross-business invitation read denied';
 rejected:=false; BEGIN INSERT INTO public.security_review_events(business_id,kind,title,details) VALUES(ba,'finding','Bad','Bad'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'cross-business review append denied';
 rejected:=false; BEGIN PERFORM public.set_branch_access(ba,branch_a,staff,true); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'cross-business branch grant denied';
 rejected:=false; BEGIN PERFORM public.accept_business_invitation(repeat('a',64)); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'invitation email mismatch denied';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',outsider,'role','authenticated')::text,true);
 rejected:=false; BEGIN PERFORM public.remove_business_member(ba,staff); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'NULL caller rank cannot remove another user';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',staff,'role','authenticated')::text,true);
 ASSERT (SELECT count(*) FROM public.branches WHERE business_id=ba)=0,'staff has no implicit branch access';
 ASSERT (SELECT count(*) FROM public.security_review_events WHERE business_id=ba)=0,'staff cannot read security history';
 rejected:=false; BEGIN INSERT INTO public.security_review_events(business_id,kind,title,details) VALUES(ba,'approval','Bad','Bad'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'staff cannot append approvals';
 rejected:=false; BEGIN INSERT INTO public.branch_memberships(business_id,branch_id,user_id,granted_by) VALUES(ba,branch_a,staff,staff); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'staff cannot self-grant branch';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 PERFORM public.set_branch_access(ba,branch_a,staff,true);
 rejected:=false; BEGIN PERFORM public.set_branch_access(ba,branch_b,staff,true); EXCEPTION WHEN raise_exception THEN rejected:=true; END; ASSERT rejected,'foreign branch ID rejected';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',staff,'role','authenticated')::text,true);
 ASSERT public.can_access_branch(ba,branch_a),'assigned staff branch allowed'; ASSERT NOT public.can_access_branch(bb,branch_b),'other tenant branch denied';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',invited,'role','authenticated')::text,true);
 ASSERT public.accept_business_invitation(repeat('a',64))=ba,'correct email invitation accepted';
 rejected:=false; BEGIN PERFORM public.accept_business_invitation(repeat('a',64)); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'invitation replay denied';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',administrator,'role','authenticated')::text,true);
 rejected:=false; BEGIN PERFORM public.create_business_invitation(ba,'test+'||outsider||'@example.invalid','admin',repeat('b',64)); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'admin cannot invite admin';
 iid:=public.create_business_invitation(ba,'test+'||outsider||'@example.invalid','staff',repeat('b',64));
 PERFORM set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 PERFORM public.update_business_member(ba,administrator,'viewer','active');
 PERFORM set_config('request.jwt.claims',json_build_object('sub',outsider,'role','authenticated')::text,true);
 rejected:=false; BEGIN PERFORM public.accept_business_invitation(repeat('b',64)); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'demoted inviter cannot grant stale authority';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 iid:=public.create_business_invitation(ba,'test+'||outsider||'@example.invalid','viewer',repeat('c',64));
 PERFORM public.revoke_business_invitation(ba,iid);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',outsider,'role','authenticated')::text,true);
 rejected:=false; BEGIN PERFORM public.accept_business_invitation(repeat('c',64)); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'revoked invitation denied';
 RESET ROLE;
 UPDATE public.business_invitations SET expires_at=now()-interval '1 day' WHERE token_hash=repeat('b',64);
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',outsider,'role','authenticated')::text,true);
 rejected:=false; BEGIN PERFORM public.accept_business_invitation(repeat('b',64)); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'expired invitation denied';
 RESET ROLE; SET LOCAL ROLE anon;
 rejected:=false; BEGIN PERFORM public.accept_business_invitation(repeat('a',64)); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'anonymous acceptance denied';
 RESET ROLE; RAISE EXCEPTION 'BUSINESS ACCESS TESTS PASSED';
END $tests$;