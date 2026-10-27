-- Run only in an isolated PostgreSQL database. All fixtures roll back.
BEGIN;
DO $test$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); viewer uuid:=gen_random_uuid(); ba uuid;bb uuid;br uuid;br2 uuid;per uuid;v uuid;d uuid:=gen_random_uuid(); snap jsonb;denied boolean;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) SELECT u,'test+'||u||'@example.invalid',now(),'{}',now(),now() FROM unnest(ARRAY[a,b,viewer])u;
 SET LOCAL ROLE authenticated;PERFORM set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 ba:=public.create_business('Accounting test A');PERFORM public.add_business_member(ba,viewer,'viewer');
 INSERT INTO public.branches(business_id,code,name)VALUES(ba,'A','A')RETURNING id INTO br;
 INSERT INTO public.branches(business_id,code,name)VALUES(ba,'B','B')RETURNING id INTO br2;
 INSERT INTO public.financial_periods(business_id,name,start_date,end_date)VALUES(ba,'Open','2026-01-01','2026-12-31')RETURNING id INTO per;
 PERFORM public.save_catalogue_variant(ba,'[{"product_name":"Report widget","sku":"REP","selling_price":100}]');SELECT id INTO v FROM public.product_variants WHERE business_id=ba;
 PERFORM public.post_stock_operation(ba,gen_random_uuid(),v,br,NULL,'opening',10,'OPEN','Opening');
 PERFORM public.post_commerce_document(jsonb_build_object('businessId',ba,'id',d,'branchId',br,'periodId',per,'date','2026-02-01','kind','sale','status','confirmed','reference','REP-1','lines',jsonb_build_array(jsonb_build_object('variantId',v,'quantity',1,'price',100)),'payments',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'method','bank','amount',100,'reference','BANK'))));
 snap:=public.read_accounting_snapshot(ba,br,'2026-02-01');
 ASSERT jsonb_array_length(snap->'documents')=1,'Confirmed document included';
 ASSERT jsonb_array_length(snap->'journals')=4,'Document and payment evidence included';
 ASSERT jsonb_typeof(snap->'journals'->0->'debit')='string','Exact numeric transport';
 ASSERT NOT (snap->'documents'->0 ? 'request'),'Request excluded';
 ASSERT jsonb_array_length(public.read_accounting_snapshot(ba,br,'2026-01-31')->'journals')=0,'End date enforced';
 ASSERT jsonb_array_length(public.read_accounting_snapshot(ba,br2,'2026-02-01')->'journals')=0,'Branch filter enforced';
 PERFORM public.set_branch_access(ba,br,viewer,true);
 PERFORM set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);bb:=public.create_business('Accounting test B');
 denied:=false;BEGIN PERFORM public.read_accounting_snapshot(ba,NULL,'2026-02-01');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;ASSERT denied,'Other tenant denied';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',viewer,'role','authenticated')::text,true);
 ASSERT jsonb_array_length(public.read_accounting_snapshot(ba,NULL,'2026-02-01')->'documents')=1,'Viewer authorized read';
 ASSERT jsonb_array_length(public.read_accounting_snapshot(ba,NULL,'2026-02-01')->'branches')=1,'Unassigned branches hidden';
 denied:=false;BEGIN PERFORM public.read_accounting_snapshot(ba,br2,'2026-02-01');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;ASSERT denied,'Explicit inaccessible branch denied';
 RESET ROLE;SET LOCAL ROLE anon;denied:=false;BEGIN PERFORM public.read_accounting_snapshot(ba,NULL,'2026-02-01');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;ASSERT denied,'Anonymous execution denied';RESET ROLE;
END $test$;
ROLLBACK;
\echo ACCOUNTING ISOLATION TESTS PASSED