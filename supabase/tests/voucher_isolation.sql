-- Isolated disposable PostgreSQL only. Fixtures and postings always roll back.
BEGIN;
DO $test$
DECLARE owner_id uuid:=gen_random_uuid();other_id uuid:=gen_random_uuid();acc uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();viewer uuid:=gen_random_uuid();b uuid;other_b uuid;br uuid;br2 uuid;per uuid;closed_per uuid;req jsonb;revreq jsonb;v uuid;rev uuid;denied boolean;bad jsonb;before_count bigint;line jsonb;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) SELECT u,'test+'||u||'@example.invalid',now(),'{}',now(),now() FROM unnest(ARRAY[owner_id,other_id,acc,staff,viewer])u;
 SET LOCAL ROLE authenticated;PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
 b:=public.create_business('Voucher A');PERFORM public.add_business_member(b,acc,'accountant');PERFORM public.add_business_member(b,staff,'staff');PERFORM public.add_business_member(b,viewer,'viewer');
 INSERT INTO public.branches(business_id,code,name)VALUES(b,'A','A')RETURNING id INTO br;INSERT INTO public.branches(business_id,code,name)VALUES(b,'B','B')RETURNING id INTO br2;
 INSERT INTO public.financial_periods(business_id,name,start_date,end_date)VALUES(b,'Open','2026-01-01','2026-12-31')RETURNING id INTO per;
 INSERT INTO public.financial_periods(business_id,name,start_date,end_date)VALUES(b,'Prior','2025-01-01','2025-12-31')RETURNING id INTO closed_per;PERFORM public.set_financial_period_status(closed_per,'closed');
 PERFORM public.set_branch_access(b,br,acc,true);PERFORM public.set_branch_access(b,br,staff,true);PERFORM public.set_branch_access(b,br,viewer,true);
 req:=jsonb_build_object('businessId',b,'branchId',br,'periodId',per,'id',gen_random_uuid(),'date','2026-10-27','reference','EXP-1','reason','Rent','kind','expense','lines',jsonb_build_array(jsonb_build_object('account','expense_rent','debit','100.25','credit','0'),jsonb_build_object('account','bank','debit','0','credit','100.25')));
 PERFORM set_config('request.jwt.claims',json_build_object('sub',acc,'role','authenticated')::text,true);v:=public.post_accounting_voucher(req);ASSERT public.post_accounting_voucher(req)=v,'Unchanged retry returns same voucher';ASSERT (SELECT count(*) FROM public.commerce_journal_entries WHERE source_id=v)=2,'Exactly two posted lines';ASSERT (SELECT sum(debit)-sum(credit) FROM public.commerce_journal_entries WHERE source_id=v)=0,'Balanced original';ASSERT (SELECT actor_id FROM public.accounting_vouchers WHERE id=v)=acc,'Trusted actor';ASSERT jsonb_array_length(public.read_accounting_snapshot(b,br,'2026-12-31')->'vouchers')=1,'Voucher snapshot evidence';
 before_count:=(SELECT count(*) FROM public.accounting_vouchers WHERE business_id=b);
 FOR bad IN SELECT x FROM unnest(ARRAY[
 req||jsonb_build_object('reason','Changed'),
 req||jsonb_build_object('id',gen_random_uuid(),'reference','BAD-1','lines',jsonb_build_array(jsonb_build_object('account','cash','debit','100.25','credit','0'),jsonb_build_object('account','bank','debit','0','credit','100.25'))),
 req||jsonb_build_object('id',gen_random_uuid(),'reference','BAD-2','lines',jsonb_build_array(jsonb_build_object('account','expense_rent','debit','100.251','credit','0'),jsonb_build_object('account','bank','debit','0','credit','100.251'))),
 req||jsonb_build_object('id',gen_random_uuid(),'reference','BAD-3','lines',jsonb_build_array(jsonb_build_object('account','expense_rent','debit','100','credit','0'),jsonb_build_object('account','bank','debit','0','credit','99'))),
 req||jsonb_build_object('id',gen_random_uuid(),'reference','BAD-4','branchId',br2),
 req||jsonb_build_object('id',gen_random_uuid(),'reference','BAD-5','periodId',closed_per,'date','2025-10-27'),
 req||jsonb_build_object('id',gen_random_uuid(),'reference','BAD-6','date','2027-01-01'),
 req||jsonb_build_object('id',gen_random_uuid(),'reference','BAD-7','lines',jsonb_build_array(jsonb_build_object('account','expense_rent','debit','NaN','credit','0'),jsonb_build_object('account','bank','debit','0','credit','NaN')))
 ]) x LOOP denied:=false;BEGIN PERFORM public.post_accounting_voucher(bad);EXCEPTION WHEN OTHERS THEN denied:=true;END;ASSERT denied,'Invalid request rejected';END LOOP;
 ASSERT (SELECT count(*) FROM public.accounting_vouchers WHERE business_id=b)=before_count,'Failures leave no header';
 revreq:=jsonb_build_object('businessId',b,'branchId',br,'periodId',per,'id',gen_random_uuid(),'date','2026-10-28','reference','REV-1','reason','Correct rent entry','kind','reversal','reversesId',v);
 denied:=false;BEGIN PERFORM public.post_accounting_voucher(revreq);EXCEPTION WHEN raise_exception THEN denied:=true;END;ASSERT denied,'Accountant cannot reverse';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',staff,'role','authenticated')::text,true);denied:=false;BEGIN PERFORM public.post_accounting_voucher(req||jsonb_build_object('id',gen_random_uuid(),'reference','STAFF'));EXCEPTION WHEN raise_exception THEN denied:=true;END;ASSERT denied,'Staff posting denied';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',viewer,'role','authenticated')::text,true);denied:=false;BEGIN PERFORM public.post_accounting_voucher(req||jsonb_build_object('id',gen_random_uuid(),'reference','VIEWER'));EXCEPTION WHEN raise_exception THEN denied:=true;END;ASSERT denied,'Viewer posting denied';ASSERT (SELECT count(*) FROM public.accounting_vouchers WHERE id=v)=1,'Viewer authorized read';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',other_id,'role','authenticated')::text,true);other_b:=public.create_business('Voucher B');ASSERT (SELECT count(*) FROM public.accounting_vouchers WHERE business_id=b)=0,'Cross tenant hidden';denied:=false;BEGIN PERFORM public.post_accounting_voucher(req||jsonb_build_object('id',gen_random_uuid(),'reference','OTHER'));EXCEPTION WHEN raise_exception THEN denied:=true;END;ASSERT denied,'Cross tenant write denied';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
 FOR bad IN SELECT x FROM unnest(ARRAY[revreq||jsonb_build_object('date','2026-10-26'),revreq||jsonb_build_object('branchId',br2),revreq||jsonb_build_object('reversesId',gen_random_uuid()),revreq||jsonb_build_object('periodId',closed_per,'date','2025-10-28')])x LOOP denied:=false;BEGIN PERFORM public.post_accounting_voucher(bad);EXCEPTION WHEN OTHERS THEN denied:=true;END;ASSERT denied,'Invalid reversal denied';END LOOP;
 rev:=public.post_accounting_voucher(revreq);ASSERT public.post_accounting_voucher(revreq)=rev,'Reversal retry once';ASSERT (SELECT count(*) FROM public.commerce_journal_entries WHERE source_id=rev)=2,'Full reversal line count';ASSERT NOT EXISTS((SELECT account_code,debit,credit FROM public.commerce_journal_entries WHERE source_id=rev) EXCEPT ALL (SELECT account_code,credit,debit FROM public.commerce_journal_entries WHERE source_id=v)),'Every original line swapped';ASSERT (SELECT sum(debit)-sum(credit) FROM public.commerce_journal_entries WHERE source_id IN(v,rev))=0,'Combined balance';
 denied:=false;BEGIN PERFORM public.post_accounting_voucher(revreq||jsonb_build_object('id',gen_random_uuid(),'reference','REV-2'));EXCEPTION WHEN OTHERS THEN denied:=true;END;ASSERT denied,'Duplicate reversal denied';
 denied:=false;BEGIN PERFORM public.post_accounting_voucher(revreq||jsonb_build_object('id',gen_random_uuid(),'reference','CHAIN','reversesId',rev));EXCEPTION WHEN OTHERS THEN denied:=true;END;ASSERT denied,'Reversal chain denied';
 denied:=false;BEGIN UPDATE public.accounting_vouchers SET reason='Changed' WHERE id=v;EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;ASSERT denied,'Header direct update denied';
 denied:=false;BEGIN DELETE FROM public.commerce_journal_entries WHERE source_id=v;EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;ASSERT denied,'Line deletion denied';
 RESET ROLE;ASSERT (SELECT count(*) FROM public.audit_logs WHERE entity_table='accounting_vouchers' AND business_id=b)=2,'Both voucher audits';
 denied:=false;BEGIN UPDATE public.accounting_vouchers SET reason='Changed' WHERE id=v;EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;ASSERT denied,'Privileged immutable header';
 SET LOCAL ROLE anon;denied:=false;BEGIN PERFORM public.post_accounting_voucher(req);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;ASSERT denied,'Anonymous execution denied';RESET ROLE;
 SET CONSTRAINTS ALL IMMEDIATE;
END $test$;
ROLLBACK;
\echo VOUCHER ISOLATION TESTS PASSED