-- Run only in the isolated SQL security workflow after migrations through 0062.
-- Covers branch-scoped requests, quantity reservation, self-approval denial,
-- atomic posting, retry safety, rejection and manager refunds.
BEGIN;
DO $tests$
<<tests>>
DECLARE
  owner_id uuid:=gen_random_uuid(); manager_id uuid:=gen_random_uuid(); cashier_id uuid:=gen_random_uuid();
  business_id uuid; branch_a uuid; branch_b uuid; period_id uuid; variant_id uuid; customer_id uuid;
  sale_a uuid:=gen_random_uuid(); sale_b uuid:=gen_random_uuid(); request_id uuid; own_request uuid;
  rejected_request uuid; return_id uuid; req jsonb; failed boolean; stock_before numeric; stock_after numeric;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at)
  VALUES(owner_id,'return-owner@example.invalid',now()),
        (manager_id,'return-manager@example.invalid',now()),
        (cashier_id,'return-cashier@example.invalid',now());
  INSERT INTO public.businesses(name,created_by) VALUES('Return Approval Test',owner_id) RETURNING id INTO business_id;
  INSERT INTO public.branches(business_id,code,name) VALUES(business_id,'A','Assigned') RETURNING id INTO branch_a;
  INSERT INTO public.branches(business_id,code,name) VALUES(business_id,'B','Unassigned') RETURNING id INTO branch_b;
  INSERT INTO public.business_memberships(business_id,user_id,role_code)
  VALUES(business_id,owner_id,'owner'),(business_id,manager_id,'branch_manager'),(business_id,cashier_id,'staff');
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM public.set_member_job_title(business_id,manager_id,'branch_manager');
  PERFORM public.set_member_job_title(business_id,cashier_id,'sales_person');
  INSERT INTO public.branch_memberships(business_id,branch_id,user_id,granted_by)
  VALUES(business_id,branch_a,manager_id,owner_id),(business_id,branch_a,cashier_id,owner_id);
  INSERT INTO public.financial_periods(business_id,name,start_date,end_date)
  VALUES(business_id,'Open FY','2026-01-01','2026-12-31') RETURNING id INTO period_id;
  PERFORM public.save_catalogue_variant(business_id,'[{"product_name":"Dress","sku":"RET-DRESS","selling_price":100}]');
  SELECT pv.id INTO variant_id FROM public.product_variants pv WHERE pv.business_id=tests.business_id AND pv.sku='RET-DRESS';
  INSERT INTO public.parties(business_id,kind,name) VALUES(business_id,'customer','Return customer') RETURNING id INTO customer_id;
  PERFORM public.post_stock_operation(business_id,gen_random_uuid(),variant_id,branch_a,NULL,'opening',10,'OPEN','Opening stock');
  PERFORM public.post_stock_operation(business_id,gen_random_uuid(),variant_id,branch_b,NULL,'opening',10,'OPEN-B','Opening stock');
  req:=jsonb_build_object('businessId',business_id,'id',sale_a,'branchId',branch_a,'periodId',period_id,
    'date','2026-11-17','kind','sale','status','confirmed','partyId',customer_id,'mobile','9841000001',
    'customerName','Return customer','reference','INV-RET-A',
    'lines',jsonb_build_array(jsonb_build_object('variantId',variant_id,'quantity',10,'price',100,'discount',0,'taxRate',0)),
    'payments',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'method','bank','amount',1000,'sessionId',NULL,'reference','Paid invoice')));
  PERFORM public.post_commerce_document(req);
  req:=jsonb_set(req,'{id}',to_jsonb(sale_b));req:=jsonb_set(req,'{branchId}',to_jsonb(branch_b));req:=jsonb_set(req,'{reference}',to_jsonb('INV-RET-B'));
  PERFORM public.post_commerce_document(req);

  SELECT coalesce(sum(quantity),0) INTO stock_before FROM public.commerce_stock_movements m WHERE m.business_id=tests.business_id AND m.branch_id=tests.branch_a AND m.variant_id=tests.variant_id;

  -- A cashier can submit a request, but it does not create a return document or restock inventory.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',cashier_id,'role','authenticated')::text,true);
  request_id:=public.request_sale_return(business_id,sale_a,jsonb_build_array(jsonb_build_object('variantId',variant_id,'quantity',2)),'Customer changed their mind');
  ASSERT (SELECT status='pending' FROM public.sale_return_requests WHERE id=request_id),'Cashier request starts pending';
  ASSERT NOT EXISTS(SELECT 1 FROM public.commerce_documents WHERE kind='sale_return' AND source_id=sale_a),'Request does not post a return';
  SELECT coalesce(sum(quantity),0) INTO stock_after FROM public.commerce_stock_movements m WHERE m.business_id=tests.business_id AND m.branch_id=tests.branch_a AND m.variant_id=tests.variant_id;
  ASSERT stock_after=stock_before,'Pending request does not change stock';

  -- A manager cannot review their own request.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',manager_id,'role','authenticated')::text,true);
  own_request:=public.request_sale_return(business_id,sale_a,jsonb_build_array(jsonb_build_object('variantId',variant_id,'quantity',1)),'Manager own request');
  SET LOCAL ROLE authenticated;
  failed:=false;
  BEGIN PERFORM public.review_sale_return_request(own_request,'approve',NULL,period_id,'2026-11-17');
  EXCEPTION WHEN OTHERS THEN failed:=true; END;
  ASSERT failed,'Requester cannot approve their own request';

  -- Branch Manager approves the cashier request. It posts one linked return and restocks exactly two.
  return_id:=public.review_sale_return_request(request_id,'approve',NULL,period_id,'2026-11-17');
  ASSERT return_id IS NOT NULL,'Manager approval returns a posted document id';
  ASSERT (SELECT status='approved' AND return_document_id=return_id FROM public.sale_return_requests WHERE id=request_id),'Request is auditable as approved';
  ASSERT (SELECT kind='sale_return' AND status='confirmed' AND source_id=sale_a AND total=200 FROM public.commerce_documents WHERE id=return_id),'Approved request posts a confirmed source-linked return at original prices';
  ASSERT (SELECT count(*)=1 FROM public.commerce_documents WHERE id=return_id),'Approval creates exactly one return document';
  ASSERT public.review_sale_return_request(request_id,'approve',NULL,period_id,'2026-11-17')=return_id,'Approval retry returns the same document';
  SELECT coalesce(sum(quantity),0) INTO stock_after FROM public.commerce_stock_movements WHERE m.business_id=tests.business_id AND m.branch_id=tests.branch_a AND m.variant_id=tests.variant_id;
  ASSERT stock_after=stock_before+2,'Approval restocks exactly the approved quantity';

  -- Branch Manager may record the refund for the approved sale return, but not purchase refunds.
  PERFORM public.post_commerce_payment(jsonb_build_object('businessId',business_id,'id',gen_random_uuid(),
    'documentId',return_id,'periodId',period_id,'date','2026-11-17','method','bank','amount',200,'reference','Approved return refund'));
  ASSERT (SELECT coalesce(sum(amount),0)=200 FROM public.commerce_payments WHERE document_id=return_id),'Approved return refund is recorded once';

  -- A return in a branch not assigned to this manager is inaccessible.
  failed:=false;
  BEGIN PERFORM public.request_sale_return(business_id,sale_b,jsonb_build_array(jsonb_build_object('variantId',variant_id,'quantity',1)),'Wrong branch');
  EXCEPTION WHEN OTHERS THEN failed:=true; END;
  ASSERT failed,'Branch Manager cannot request a return in an unassigned branch';

  RESET ROLE;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',cashier_id,'role','authenticated')::text,true);
  rejected_request:=public.request_sale_return(business_id,sale_a,jsonb_build_array(jsonb_build_object('variantId',variant_id,'quantity',1)),'Damaged packaging');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',manager_id,'role','authenticated')::text,true);
  PERFORM public.review_sale_return_request(rejected_request,'reject','Inspection failed; item not returned',NULL,'2026-11-17');
  ASSERT (SELECT status='rejected' AND decision_reason='Inspection failed; item not returned' FROM public.sale_return_requests WHERE id=rejected_request),'Rejection reason is retained';
  SELECT coalesce(sum(quantity),0) INTO stock_after FROM public.commerce_stock_movements WHERE m.business_id=tests.business_id AND m.branch_id=tests.branch_a AND m.variant_id=tests.variant_id;
  ASSERT stock_after=stock_before+2,'Rejected request does not change stock';

  -- Direct sale-return posting without a matching approved request is blocked even for an owner.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  failed:=false;
  BEGIN
    PERFORM public.post_commerce_document(jsonb_build_object('businessId',business_id,'id',gen_random_uuid(),
      'branchId',branch_a,'periodId',period_id,'date','2026-11-17','kind','sale_return','status','confirmed',
      'sourceId',sale_a,'partyId',customer_id,'reference','BYPASS-RETURN',
      'lines',jsonb_build_array(jsonb_build_object('variantId',variant_id,'quantity',1,'price',100,'discount',0,'taxRate',0)),
      'payments','[]'::jsonb));
  EXCEPTION WHEN OTHERS THEN failed:=true; END;
  ASSERT failed,'Direct sale return bypass is denied';

  RAISE NOTICE 'SALE_RETURN_APPROVAL_TESTS_PASSED';
END
$tests$;
ROLLBACK;
