-- Isolated database only. Final exception deliberately rolls back all fixtures.
-- Pass = error 'EXPENSE RECEIPT TESTS PASSED'.
DO $tests$
DECLARE
  owner_id uuid:=gen_random_uuid(); acc uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); viewer uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid();
  b uuid; ob uuid; br uuid; per uuid; r1 uuid; r2 uuid; r3 uuid; r4 uuid; req jsonb; req2 jsonb; v uuid; v2 uuid; denied boolean;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) SELECT u,'test+'||u||'@example.invalid',now(),'{}',now(),now() FROM unnest(ARRAY[owner_id,acc,staff,viewer,other_id]) u;
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
 b:=public.create_business('Receipts A'); PERFORM public.add_business_member(b,acc,'accountant'); PERFORM public.add_business_member(b,staff,'staff'); PERFORM public.add_business_member(b,viewer,'viewer');
 INSERT INTO public.branches(business_id,code,name) VALUES(b,'A','A') RETURNING id INTO br;
 INSERT INTO public.financial_periods(business_id,name,start_date,end_date) VALUES(b,'Open','2026-01-01','2026-12-31') RETURNING id INTO per;
 PERFORM public.set_branch_access(b,br,acc,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',other_id,'role','authenticated')::text,true);
 ob:=public.create_business('Receipts B');

 -- Accountants upload receipts; nobody else can.
 PERFORM set_config('request.jwt.claims',json_build_object('sub',acc,'role','authenticated')::text,true);
 INSERT INTO public.expense_receipts(business_id,file_path,file_name,mime_type,ai_extraction,uploaded_by) VALUES(b,b||'/'||gen_random_uuid()||'.jpg','power.jpg','image/jpeg','{"supplier":"Nepal Power","total":"100.25"}'::jsonb,acc) RETURNING id INTO r1;
 INSERT INTO public.expense_receipts(business_id,file_path,file_name,mime_type,ai_error,uploaded_by) VALUES(b,b||'/'||gen_random_uuid()||'.pdf','rent.pdf','application/pdf','AI credits are used up',acc) RETURNING id INTO r2;
 INSERT INTO public.expense_receipts(business_id,file_path,file_name,mime_type,uploaded_by) VALUES(b,b||'/'||gen_random_uuid()||'.png','staff.png','image/png',acc) RETURNING id INTO r3;
 INSERT INTO public.expense_receipts(business_id,file_path,file_name,mime_type,uploaded_by) VALUES(b,b||'/'||gen_random_uuid()||'.png','late.png','image/png',acc) RETURNING id INTO r4;
 ASSERT (SELECT status FROM public.expense_receipts WHERE id=r1)='needs_review','New receipts await review';
 denied:=false; BEGIN INSERT INTO public.expense_receipts(business_id,file_path,file_name,mime_type,uploaded_by) VALUES(b,b||'/x.jpg','x.jpg','image/jpeg',owner_id); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; ASSERT denied,'Cannot upload as someone else';
 denied:=false; BEGIN INSERT INTO public.expense_receipts(business_id,file_path,file_name,mime_type,status,uploaded_by) VALUES(b,b||'/x.jpg','x.jpg','image/jpeg','rejected',acc); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; ASSERT denied,'Cannot upload as already decided';
 denied:=false; BEGIN INSERT INTO public.expense_receipts(business_id,file_path,file_name,mime_type,uploaded_by) VALUES(b,ob::text||'/x.jpg','x.jpg','image/jpeg',acc); EXCEPTION WHEN check_violation OR insufficient_privilege THEN denied:=true; END; ASSERT denied,'File must live in the business folder';
 denied:=false; BEGIN INSERT INTO public.expense_receipts(business_id,file_path,file_name,mime_type,uploaded_by) VALUES(b,b||'/x.exe','x.exe','application/x-msdownload',acc); EXCEPTION WHEN check_violation THEN denied:=true; END; ASSERT denied,'Only images and PDFs';
 denied:=false; BEGIN UPDATE public.expense_receipts SET ai_extraction='{"total":"1"}' WHERE id=r1; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; ASSERT denied,'What the AI said cannot be edited afterwards';
 denied:=false; BEGIN UPDATE public.expense_receipts SET status='posted' WHERE id=r1; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; ASSERT denied,'Status can only change through the review functions';
 denied:=false; BEGIN DELETE FROM public.expense_receipts WHERE id=r1; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; ASSERT denied,'Receipts are never deleted';

 FOREACH v IN ARRAY ARRAY[staff,viewer,other_id] LOOP
   PERFORM set_config('request.jwt.claims',json_build_object('sub',v,'role','authenticated')::text,true);
   ASSERT (SELECT count(*) FROM public.expense_receipts WHERE business_id=b)=0,'Only accountants and above can see receipts';
   denied:=false; BEGIN INSERT INTO public.expense_receipts(business_id,file_path,file_name,mime_type,uploaded_by) VALUES(b,b||'/y.jpg','y.jpg','image/jpeg',v); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; ASSERT denied,'Staff, viewers and outsiders cannot upload';
 END LOOP;

 -- Confirm posts a normal expense voucher and links it, exactly once.
 PERFORM set_config('request.jwt.claims',json_build_object('sub',acc,'role','authenticated')::text,true);
 req:=jsonb_build_object('businessId',b,'branchId',br,'periodId',per,'id',gen_random_uuid(),'date','2026-10-27','reference','INV-77','reason','Nepal Power: electricity','kind','expense','lines',jsonb_build_array(jsonb_build_object('account','expense_utilities','debit','100.25','credit','0'),jsonb_build_object('account','bank','debit','0','credit','100.25')));
 v:=public.confirm_expense_receipt(r1,req);
 ASSERT (SELECT status||(voucher_id=v)::text FROM public.expense_receipts WHERE id=r1)='postedtrue','Receipt linked to its voucher';
 ASSERT (SELECT reviewed_by FROM public.expense_receipts WHERE id=r1)=acc,'Reviewer recorded';
 ASSERT (SELECT count(*) FROM public.commerce_journal_entries WHERE source_id=v)=2,'Exactly two journal lines';
 ASSERT public.confirm_expense_receipt(r1,req)=v,'Retrying the same request returns the same voucher';
 ASSERT (SELECT count(*) FROM public.accounting_vouchers WHERE business_id=b)=1,'No second voucher from the retry';
 denied:=false; BEGIN PERFORM public.confirm_expense_receipt(r1,req||jsonb_build_object('id',gen_random_uuid(),'reference','INV-77B')); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'A posted receipt cannot be posted again';
 -- New categories are accepted; mismatched requests are not.
 req2:=req||jsonb_build_object('id',gen_random_uuid(),'reference','SAL-1','reason','Salary advance','lines',jsonb_build_array(jsonb_build_object('account','expense_salaries','debit','500','credit','0'),jsonb_build_object('account','wallet','debit','0','credit','500')));
 denied:=false; BEGIN PERFORM public.confirm_expense_receipt(r3,req2||jsonb_build_object('businessId',ob)); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Request for another business denied';
 denied:=false; BEGIN PERFORM public.confirm_expense_receipt(r3,req2||jsonb_build_object('kind','journal')); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Only expense requests accepted';
 denied:=false; BEGIN PERFORM public.confirm_expense_receipt(r3,req2||jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('account','sales','debit','500','credit','0'),jsonb_build_object('account','wallet','debit','0','credit','500')))); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Protected accounts denied';
 ASSERT (SELECT status FROM public.expense_receipts WHERE id=r3)='needs_review','Failed confirms leave the receipt waiting';
 v2:=public.confirm_expense_receipt(r3,req2);
 ASSERT (SELECT account_code FROM public.commerce_journal_entries WHERE source_id=v2 AND debit>0)='expense_salaries','New salary category posts';

 -- Rejecting needs a reason and is final.
 denied:=false; BEGIN PERFORM public.reject_expense_receipt(r2,'   '); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Reason required';
 PERFORM public.reject_expense_receipt(r2,'Not a business expense');
 ASSERT (SELECT status||review_note FROM public.expense_receipts WHERE id=r2)='rejectedNot a business expense','Rejection recorded with its reason';
 denied:=false; BEGIN PERFORM public.reject_expense_receipt(r2,'again'); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Cannot reject twice';
 denied:=false; BEGIN PERFORM public.confirm_expense_receipt(r2,req||jsonb_build_object('id',gen_random_uuid(),'reference','AFTER-REJECT')); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Cannot post a rejected receipt';

 -- Roles below accountant cannot decide, and other businesses cannot touch these.
 FOREACH v IN ARRAY ARRAY[staff,viewer,other_id] LOOP
   PERFORM set_config('request.jwt.claims',json_build_object('sub',v,'role','authenticated')::text,true);
   denied:=false; BEGIN PERFORM public.confirm_expense_receipt(r4,req||jsonb_build_object('id',gen_random_uuid(),'reference','NOPE')); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Confirm denied below accountant';
   denied:=false; BEGIN PERFORM public.reject_expense_receipt(r4,'no'); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Reject denied below accountant';
 END LOOP;
 RESET ROLE; RAISE EXCEPTION 'EXPENSE RECEIPT TESTS PASSED';
END $tests$;
