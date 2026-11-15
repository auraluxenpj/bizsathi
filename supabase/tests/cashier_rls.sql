-- Run only against an isolated PostgreSQL test database. All fixture rows roll back.
BEGIN;
DO $test$
#variable_conflict use_variable
DECLARE
  owner_id uuid := gen_random_uuid();
  cashier_id uuid := gen_random_uuid();
  entry_id uuid := gen_random_uuid();
  business_id uuid;
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

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  business_id := public.create_business('Cashier RLS test');
  INSERT INTO public.branches(business_id,code,name) VALUES(business_id,'MAIN','Main') RETURNING id INTO branch_id;
  INSERT INTO public.financial_periods(business_id,name,start_date,end_date)
  VALUES(business_id,'Open','2026-01-01','2026-12-31') RETURNING id INTO period_id;
  PERFORM public.add_business_member(business_id,cashier_id,'staff');
  PERFORM public.add_business_member(business_id,entry_id,'staff');
  PERFORM public.set_branch_access(business_id,branch_id,cashier_id,true);
  PERFORM public.set_branch_access(business_id,branch_id,entry_id,true);
  PERFORM public.save_catalogue_variant(business_id,'[{"product_name":"RLS Test Item","sku":"RLS-1","selling_price":100}]');
  SELECT id INTO variant_id FROM public.product_variants pv WHERE pv.business_id=business_id AND pv.sku='RLS-1';
  INSERT INTO public.parties(business_id,kind,name) VALUES(business_id,'customer','RLS Test Customer') RETURNING id INTO customer_id;
  PERFORM public.post_stock_operation(business_id,gen_random_uuid(),variant_id,branch_id,NULL,'opening',20,'RLS-OPEN','Fixture stock');

  RESET ROLE;
  UPDATE public.business_memberships m SET job_title='sales_person'
  WHERE m.business_id=business_id AND m.user_id=cashier_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',cashier_id,'role','authenticated')::text,true);
  PERFORM public.post_cash_counter_event(jsonb_build_object(
    'businessId',business_id,'id',gen_random_uuid(),'branchId',branch_id,'periodId',period_id,
    'sessionId',cashier_session,'kind','open','amount',500,'date','2026-11-15','reference','Cashier open'
  ));
  req := jsonb_build_object(
    'businessId',business_id,'id',cashier_sale,'branchId',branch_id,'periodId',period_id,
    'date','2026-11-15','kind','sale','status','confirmed','partyId',customer_id,'mobile','9841234568','mobile','9841234567',
    'reference','CASHIER-SALE','lines',jsonb_build_array(jsonb_build_object(
      'variantId',variant_id,'quantity',1,'price',100,'discount',0,'taxRate',0
    )),
    'payments',jsonb_build_array(jsonb_build_object(
      'id',gen_random_uuid(),'method','bank','amount',100,'reference','Cashier bank payment'
    ))
  );
  PERFORM public.post_commerce_document(req);

  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM public.post_cash_counter_event(jsonb_build_object(
    'businessId',business_id,'id',gen_random_uuid(),'branchId',branch_id,'periodId',period_id,
    'sessionId',owner_session,'kind','open','amount',700,'date','2026-11-15','reference','Owner open'
  ));
  PERFORM public.post_commerce_document(jsonb_build_object(
    'businessId',business_id,'id',owner_sale,'branchId',branch_id,'periodId',period_id,
    'date','2026-11-15','kind','sale','status','confirmed','partyId',customer_id,
    'reference','OWNER-SALE','lines',jsonb_build_array(jsonb_build_object(
      'variantId',variant_id,'quantity',1,'price',100,'discount',0,'taxRate',0
    )),
    'payments',jsonb_build_array(jsonb_build_object(
      'id',gen_random_uuid(),'method','bank','amount',100,'reference','Owner bank payment'
    ))
  ));

  PERFORM set_config('request.jwt.claims',json_build_object('sub',cashier_id,'role','authenticated')::text,true);
  ASSERT (SELECT count(*) FROM public.commerce_documents t WHERE t.business_id=business_id)=1,
    'Cashier sees only own sale';
  ASSERT EXISTS(SELECT 1 FROM public.commerce_documents WHERE id=cashier_sale),
    'Cashier can see own sale';
  ASSERT NOT EXISTS(SELECT 1 FROM public.commerce_documents WHERE id=owner_sale),
    'Cashier cannot see another user sale';
  ASSERT (SELECT count(*) FROM public.commerce_payments t WHERE t.business_id=business_id)=1,
    'Cashier sees only payment on own sale';
  ASSERT (SELECT count(*) FROM public.cash_counter_events t WHERE t.business_id=business_id)=1,
    'Cashier sees only own drawer session';
  ASSERT (SELECT count(*) FROM public.commerce_journal_entries t WHERE t.business_id=business_id)=0,
    'Cashier cannot read journal ledger';
  ASSERT (SELECT count(*) FROM public.customer_memberships t WHERE t.business_id=business_id)=0,
    'Cashier cannot enumerate membership directory';
  ASSERT (SELECT count(*) FROM public.loyalty_point_events t WHERE t.business_id=business_id)=0,
    'Cashier cannot read loyalty event ledger';

  PERFORM set_config('request.jwt.claims',json_build_object('sub',entry_id,'role','authenticated')::text,true);
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

  RESET ROLE;
END
$test$;
ROLLBACK;
\echo CASHIER RLS TESTS PASSED
