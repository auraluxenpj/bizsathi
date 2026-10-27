-- Run ONLY in the isolated PostgreSQL test database; all records roll back.
DO $test$
DECLARE owner_id uuid:=gen_random_uuid();staff_id uuid:=gen_random_uuid();business uuid;br uuid;variant uuid;period uuid;req jsonb;sale_id uuid:=gen_random_uuid();rejected boolean;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)SELECT u,'offline+'||u||'@example.invalid',now(),'{}',now(),now()FROM unnest(ARRAY[owner_id,staff_id])u;
 SET LOCAL ROLE authenticated;PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
 business:=public.create_business('Isolated offline tests');PERFORM public.add_business_member(business,staff_id,'staff');
 INSERT INTO public.branches(business_id,code,name)VALUES(business,'LOCAL','Local')RETURNING id INTO br;
 INSERT INTO public.financial_periods(business_id,name,start_date,end_date)VALUES(business,'Open','2026-01-01','2026-12-31')RETURNING id INTO period;
 PERFORM public.save_catalogue_variant(business,'[{"product_name":"Test only","sku":"OFF","selling_price":100}]');SELECT id INTO variant FROM public.product_variants WHERE business_id=business;
 PERFORM public.post_stock_operation(business,gen_random_uuid(),variant,br,NULL,'opening',5,'OPEN','Test only');PERFORM public.set_branch_access(business,br,staff_id,true);
 req:=jsonb_build_object('businessId',business,'id',sale_id,'branchId',br,'periodId',period,'date','2026-10-27','kind','sale','status','confirmed','reference','LOCAL-1','lines',jsonb_build_array(jsonb_build_object('variantId',variant,'quantity',2,'price',100,'discount',0,'taxRate',0)),'payments',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'method','bank','amount',200,'reference','LOCAL-1')));
 -- Reconnect must use current authority, not the previously cached grant.
 PERFORM public.set_branch_access(business,br,staff_id,false);PERFORM set_config('request.jwt.claims',json_build_object('sub',staff_id,'role','authenticated')::text,true);
 rejected:=false;BEGIN PERFORM public.post_commerce_document(req);EXCEPTION WHEN raise_exception THEN rejected:=true;END;ASSERT rejected,'Revoked branch denies queued confirmation';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);PERFORM public.set_branch_access(business,br,staff_id,true);PERFORM public.update_business_member(business,staff_id,'viewer','active');
 PERFORM set_config('request.jwt.claims',json_build_object('sub',staff_id,'role','authenticated')::text,true);rejected:=false;BEGIN PERFORM public.post_commerce_document(req);EXCEPTION WHEN raise_exception THEN rejected:=true;END;ASSERT rejected,'Revoked sale role denies queued confirmation';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);PERFORM public.update_business_member(business,staff_id,'staff','active');
 UPDATE public.business_settings SET vat_registered=true,vat_rate=13 WHERE business_id=business;
 rejected:=false;BEGIN PERFORM public.post_commerce_document(req||jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('variantId',variant,'quantity',2,'price',100,'taxRate',12))));EXCEPTION WHEN raise_exception THEN rejected:=true;END;ASSERT rejected,'Stale nonzero VAT denied';
 UPDATE public.product_variants SET is_active=false WHERE id=variant;rejected:=false;BEGIN PERFORM public.post_commerce_document(req);EXCEPTION WHEN raise_exception THEN rejected:=true;END;ASSERT rejected,'Inactive product denies queued sale';UPDATE public.product_variants SET is_active=true WHERE id=variant;
 PERFORM public.set_financial_period_status(period,'closed');rejected:=false;BEGIN PERFORM public.post_commerce_document(req);EXCEPTION WHEN raise_exception THEN rejected:=true;END;ASSERT rejected,'Closed period denies queued sale';PERFORM public.set_financial_period_status(period,'open');
 rejected:=false;BEGIN PERFORM public.post_commerce_document(req||jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('variantId',variant,'quantity',6,'price',100))));EXCEPTION WHEN raise_exception THEN rejected:=true;END;ASSERT rejected,'Insufficient stock denies queued sale';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',staff_id,'role','authenticated')::text,true);PERFORM public.post_commerce_document(req);PERFORM public.post_commerce_document(req);
 ASSERT(SELECT count(*)FROM public.commerce_documents WHERE id=sale_id)=1,'Reconnect retries post once';ASSERT((SELECT coalesce(sum(quantity),0)FROM public.stock_movements WHERE business_id=business AND branch_id=br AND variant_id=variant)+(SELECT coalesce(sum(quantity),0)FROM public.commerce_stock_movements WHERE business_id=business AND branch_id=br AND variant_id=variant))=3,'Reconnect stock deducted once';ASSERT(SELECT sum(debit)-sum(credit)FROM public.commerce_journal_entries WHERE source_id=sale_id)=0,'Reconnect journal balances';
 rejected:=false;BEGIN PERFORM public.post_commerce_document(req||jsonb_build_object('reference','Changed'));EXCEPTION WHEN raise_exception THEN rejected:=true;END;ASSERT rejected,'Changed uncertain request denied';
 RESET ROLE;SET CONSTRAINTS ALL IMMEDIATE;RAISE EXCEPTION 'OFFLINE RECONNECT TESTS PASSED';
END $test$;