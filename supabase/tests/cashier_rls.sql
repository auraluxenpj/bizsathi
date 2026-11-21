-- Run only against an isolated PostgreSQL test database. All fixture rows roll back.
BEGIN;
DO $test$
#variable_conflict use_variable
DECLARE
  owner_id uuid := gen_random_uuid();
  cashier_id uuid := gen_random_uuid();
  entry_id uuid := gen_random_uuid();
  -- Sutra authorization is intentionally bound to the canonical Auraluxe workspace.
  business_id uuid := 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
  branch_id uuid;
  period_id uuid;
  variant_id uuid;
  customer_id uuid;
  cashier_session uuid := gen_random_uuid();
  owner_session uuid := gen_random_uuid();
  cashier_sale uuid := gen_random_uuid();
  owner_sale uuid := gen_random_uuid();
  req jsonb;
  denied boolean;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  SELECT u,'cashier-rls+'||u||'@example.invalid',now(),'{}',now(),now()
  FROM unnest(ARRAY[owner_id,cashier_id,entry_id]) u;

  -- Build isolated fixtures as the database owner; no live business or users are touched.
  -- The canonical workspace ID is required because migration 0099 deliberately rejects
  -- authorization checks for every other business ID.
  INSERT INTO public.businesses(id,name,created_by)
  VALUES(business_id,'Cashier RLS test',owner_id);
  INSERT INTO public.business_memberships(business_id,user_id,role_code,job_title)
  VALUES
    (business_id,owner_id,'owner',NULL),
    (business_id,cashier_id,'staff','sales_person'),
    (business_id,entry_id,'staff',NULL);
  INSERT INTO public.branches(business_id,code,name) VALUES(business_id,'MAIN','Main') RETURNING id INTO branch_id;
  INSERT INTO public.branch_memberships(business_id,branch_id,user_id,granted_by)
  VALUES (business_id,branch_id,cashier_id,owner_id),(business_id,branch_id,entry_id,owner_id);
  INSERT INTO public.financial_periods(business_id,name,start_date,end_date)
  VALUES(business_id,'Open','2026-01-01','2026-12-31') RETURNING id INTO period_id;
  INSERT INTO public.business_settings(business_id) VALUES(business_id);

  -- Keep fixture creation under the database owner; exercise authenticated RLS only after setup.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM public.save_catalogue_variant(business_id,'[{"product_name":"RLS Test Item","sku":"RLS-1","selling_price":100}]');
  SELECT id INTO variant_id FROM public.product_variants pv WHERE pv.business_id=business_id AND pv.sku='RLS-1';
  INSERT INTO public.parties(business_id,kind,name) VALUES(business_id,'customer','RLS Test Customer') RETURNING id INTO customer_id;
  PERFORM public.post_stock_operation(business_id,gen_random_uuid(),variant_id,branch_id,NULL,'opening',20,'RLS-OPEN','Fixture stock');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM public.post_cash_counter_event(jsonb_build_object(
    'businessId',business_id,'id',gen_random_uuid(),'branchId',branch_id,'periodId',period_id,
    'sessionId',owner_session,'kind','open','amount',700,'date','2026-11-15','reference','Shared branch open'
  ));

  PERFORM set_config('request.jwt.claims',json_build_object('sub',cashier_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',cashier_id::text,true);
  denied := false;
  BEGIN
    PERFORM public.post_cash_counter_event(jsonb_build_object(
      'businessId',business_id,'id',gen_random_uuid(),'branchId',branch_id,'periodId',period_id,
      'sessionId',cashier_session,'kind','open','amount',500,'date','2026-11-15','reference','Duplicate cashier open'
    ));
  EXCEPTION WHEN raise_exception THEN denied := true;
  END;
  ASSERT denied, 'Second cashier cannot open a duplicate branch counter';

  req := jsonb_build_object(
    'businessId',business_id,'id',cashier_sale,'branchId',branch_id,'periodId',period_id,
    'date','2026-11-15','kind','sale','status','confirmed','partyId',customer_id,'mobile','9841234567',
    'reference','CASHIER-SALE','lines',jsonb_build_array(jsonb_build_object(
      'variantId',variant_id,'quantity',1,'price',100,'discount',0,'taxRate',0
    )),
    'payments',jsonb_build_array(jsonb_build_object(
      'id',gen_random_uuid(),'method','cash','amount',100,'sessionId',owner_session,'reference','Cashier cash payment'
    ))
  );
  PERFORM public.post_commerce_document(req);

  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM public.post_commerce_document(jsonb_build_object(
    'businessId',business_id,'id',owner_sale,'branchId',branch_id,'periodId',period_id,
    'date','2026-11-15','kind','sale','status','confirmed','partyId',customer_id,
    'reference','OWNER-SALE','mobile','9841234569','lines',jsonb_build_array(jsonb_build_object(
      'variantId',variant_id,'quantity',1,'price',100,'discount',0,'taxRate',0
    )),
    'payments',jsonb_build_array(jsonb_build_object(
      'id',gen_random_uuid(),'method','bank','amount',100,'reference','Owner bank payment'
    ))
  ));

  PERFORM set_config('request.jwt.claims',json_build_object('sub',cashier_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',cashier_id::text,true);
  ASSERT (SELECT count(*) FROM public.commerce_documents t WHERE t.business_id=business_id)=1,
    'Cashier sees only own sale';
  ASSERT EXISTS(SELECT 1 FROM public.commerce_documents WHERE id=cashier_sale),
    'Cashier can see own sale';
  ASSERT NOT EXISTS(SELECT 1 FROM public.commerce_documents WHERE id=owner_sale),
    'Cashier cannot see another user sale';
  ASSERT (SELECT count(*) FROM public.commerce_payments t WHERE t.business_id=business_id)=1,
    'Cashier sees only payment on own sale';
  ASSERT (SELECT count(*) FROM public.cash_counter_events t WHERE t.business_id=business_id)=1,
    'Cashier sees the one active shared branch session';
  ASSERT EXISTS(SELECT 1 FROM public.commerce_payments WHERE document_id=cashier_sale AND session_id=owner_session),
    'Cashier cash payment is linked to the shared branch session';
  ASSERT EXISTS(SELECT 1 FROM public.commerce_payments WHERE document_id=cashier_sale AND actor_id=cashier_id),
    'Shared counter payment retains the actual cashier as its actor';
  ASSERT (SELECT count(*) FROM public.commerce_journal_entries t WHERE t.business_id=business_id)=0,
    'Cashier cannot read journal ledger';
  ASSERT (SELECT count(*) FROM public.customer_memberships t WHERE t.business_id=business_id)=0,
    'Cashier cannot enumerate membership directory';
  ASSERT (SELECT count(*) FROM public.loyalty_point_events t WHERE t.business_id=business_id)=0,
    'Cashier cannot read loyalty event ledger';

  PERFORM set_config('request.jwt.claims',json_build_object('sub',entry_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',entry_id::text,true);
  ASSERT (SELECT count(*) FROM public.commerce_documents t WHERE t.business_id=business_id)=0,
    'Entry staff cannot read commerce documents';
  ASSERT (SELECT count(*) FROM public.cash_counter_events t WHERE t.business_id=business_id)=0,
    'Entry staff cannot read cash sessions';
  denied := false;
  BEGIN
    PERFORM public.post_cash_counter_event(jsonb_build_object(
      'businessId',business_id,'id',gen_random_uuid(),'branchId',branch_id,'periodId',period_id,
      'sessionId',gen_random_uuid(),'kind','open','amount',0,'date','2026-11-15','reference','Must be denied'
    ));
  EXCEPTION WHEN raise_exception THEN denied := true;
  END;
  ASSERT denied, 'Entry staff cannot open a cash counter';

  PERFORM set_config('request.jwt.claims',json_build_object('sub',cashier_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',cashier_id::text,true);
  denied := false;
  BEGIN
    PERFORM public.post_cash_counter_event(jsonb_build_object(
      'businessId',business_id,'id',gen_random_uuid(),'branchId',branch_id,'periodId',period_id,
      'sessionId',owner_session,'kind','close','amount',600,'date','2026-11-15','reference','Cashier must not close'
    ));
  EXCEPTION WHEN raise_exception THEN denied := true;
  END;
  ASSERT denied, 'Cashier cannot close the shared branch counter';

  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM public.post_cash_counter_event(jsonb_build_object(
    'businessId',business_id,'id',gen_random_uuid(),'branchId',branch_id,'periodId',period_id,
    'sessionId',owner_session,'kind','close','amount',600,'date','2026-11-15','reference','Manager close'
  ));
  ASSERT EXISTS(SELECT 1 FROM public.cash_counter_events WHERE session_id=owner_session AND kind='close' AND actor_id=owner_id),
    'Manager can close the shared branch counter';

  RESET ROLE;
END
$test$;
ROLLBACK;
\echo CASHIER RLS TESTS PASSED
