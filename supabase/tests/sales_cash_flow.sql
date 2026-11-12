-- ONLY run against an isolated schema clone. All synthetic fixtures roll back.
BEGIN;
INSERT INTO public.roles(code,name,rank) VALUES('owner','Owner',100),('admin','Admin',80),('accountant','Accountant',60),('staff','Staff',40),('viewer','Viewer',20) ON CONFLICT DO NOTHING;
DO $$
DECLARE u uuid:=gen_random_uuid();other uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();b uuid;ob uuid;br uuid;hidden uuid;per uuid;p uuid;v uuid;q uuid:=gen_random_uuid();sale uuid;posted uuid;req jsonb;doc jsonb;denied boolean;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u,'owner@example.invalid','{}'),(other,'other@example.invalid','{}'),(staff,'staff@example.invalid','{}');
 INSERT INTO public.profiles(id) VALUES(u),(other),(staff) ON CONFLICT DO NOTHING;
 SET LOCAL ROLE authenticated;PERFORM set_config('request.jwt.claims',json_build_object('sub',u)::text,true);
 b:=public.create_business('Quotation test');PERFORM public.add_business_member(b,staff,'staff');
 INSERT INTO public.branches(business_id,code,name) VALUES(b,'A','Main') RETURNING id INTO br;
 INSERT INTO public.branches(business_id,code,name) VALUES(b,'B','Hidden') RETURNING id INTO hidden;
 INSERT INTO public.financial_periods(business_id,name,start_date,end_date) VALUES(b,'Open','2026-01-01','2026-12-31') RETURNING id INTO per;
 INSERT INTO public.parties(business_id,kind,name,phone,address) VALUES(b,'customer','Original customer','9812345678','Original address') RETURNING id INTO p;
 PERFORM public.save_catalogue_variant(b,'[{"product_name":"Original dress","sku":"AL-Q","selling_price":200}]');SELECT id INTO v FROM public.product_variants WHERE business_id=b;
 PERFORM public.post_stock_operation(b,gen_random_uuid(),v,br,NULL,'opening',10,'Opening','Test opening');
 req:=jsonb_build_object('businessId',b,'id',q,'revision',0,'branchId',br,'partyId',p,'date','2026-11-12','expiresOn',NULL,'reference','EST-1','status','accepted','mobile','9812345678','lines',jsonb_build_array(jsonb_build_object('variantId',v,'quantity',2,'price',123.45,'discount',6.78,'taxRate',0)));
 ASSERT public.save_quotation(req)=q;ASSERT public.save_quotation(req)=q;ASSERT (SELECT revision FROM public.quotations WHERE id=q)=1,'Quotation replay must not update revision';
 UPDATE public.parties SET name='Changed customer',phone='9811111111',address='Changed address' WHERE id=p;
 sale:=public.convert_quotation(b,q,per,'2026-11-12');ASSERT public.convert_quotation(b,q,per,'2026-11-12')=sale,'Conversion must be unique';
 ASSERT (SELECT count(*) FROM public.commerce_documents WHERE quotation_id=q)=1;
 ASSERT (SELECT status FROM public.commerce_documents WHERE id=sale)='draft';ASSERT public.commerce_stock_balance(b,br,v)=10,'Estimate conversion must not move stock';
 ASSERT NOT EXISTS(SELECT 1 FROM public.commerce_journal_entries WHERE business_id=b);ASSERT NOT EXISTS(SELECT 1 FROM public.loyalty_point_events WHERE business_id=b);
 ASSERT (SELECT customer->>'name' FROM public.quotations WHERE id=q)='Original customer';
 denied:=false;BEGIN PERFORM public.save_quotation(req||jsonb_build_object('revision',2,'reference','EDIT'));EXCEPTION WHEN OTHERS THEN denied:=true;END;ASSERT denied,'Converted estimate is locked';
 SELECT request INTO doc FROM public.commerce_documents WHERE id=sale;doc:=doc||jsonb_build_object('id',gen_random_uuid(),'status','confirmed');
 posted:=public.post_commerce_document(doc);ASSERT public.post_commerce_document(doc)=posted,'Confirmed exact-request retry must succeed';
 ASSERT public.commerce_stock_balance(b,br,v)=8;ASSERT (SELECT total FROM public.commerce_documents WHERE id=posted)=240.12;ASSERT (SELECT lines->0->>'name' FROM public.commerce_documents WHERE id=posted)='Original dress · Standard';
 denied:=false;BEGIN PERFORM public.post_commerce_document(doc||jsonb_build_object('id',gen_random_uuid()));EXCEPTION WHEN OTHERS THEN denied:=true;END;ASSERT denied,'Second confirmation of same estimate must fail';
 denied:=false;BEGIN PERFORM public.post_commerce_document(doc||jsonb_build_object('id',gen_random_uuid(),'lines',jsonb_build_array(jsonb_build_object('variantId',v,'quantity',2,'price',999,'discount',0,'taxRate',0))));EXCEPTION WHEN OTHERS THEN denied:=true;END;ASSERT denied,'Repricing estimate must fail';
 PERFORM public.set_branch_access(b,br,staff,true);PERFORM set_config('request.jwt.claims',json_build_object('sub',staff)::text,true);
 denied:=false;BEGIN PERFORM public.save_quotation(req||jsonb_build_object('id',gen_random_uuid(),'branchId',hidden));EXCEPTION WHEN OTHERS THEN denied:=true;END;ASSERT denied,'Hidden branch quotation forbidden';
 UPDATE public.parties SET credit_limit=0 WHERE id=p;ASSERT NOT FOUND,'Staff must not edit credit limits';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',other)::text,true);ob:=public.create_business('Other business');ASSERT NOT EXISTS(SELECT 1 FROM public.quotations WHERE business_id=b),'Other tenant cannot read quotation';
 denied:=false;BEGIN PERFORM public.convert_quotation(b,q,per,'2026-11-12');EXCEPTION WHEN OTHERS THEN denied:=true;END;ASSERT denied,'Other tenant cannot convert quotation';
END $$;
ROLLBACK;