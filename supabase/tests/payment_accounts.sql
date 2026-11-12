-- Isolated database only. Final exception deliberately rolls back all fixtures.
-- Pass = error 'PAYMENT ACCOUNT TESTS PASSED'.
DO $tests$
DECLARE
  owner_id uuid:=gen_random_uuid(); acc uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); viewer uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid();
  b uuid; ob uuid; br uuid; per uuid; v uuid; sup uuid; cust uuid;
  bank uuid:=gen_random_uuid(); wallet uuid:=gen_random_uuid(); safe uuid:=gen_random_uuid(); bank2 uuid:=gen_random_uuid();
  r jsonb; vid uuid; vid2 uuid; doc uuid; pay uuid; pay2 uuid; exp_id uuid; denied boolean; gl numeric;
  req jsonb;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) SELECT u,'test+'||u||'@example.invalid',now(),'{}',now(),now() FROM unnest(ARRAY[owner_id,acc,staff,viewer,other_id]) u;
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
 b:=public.create_business('Accounts A'); PERFORM public.add_business_member(b,acc,'accountant'); PERFORM public.add_business_member(b,staff,'staff'); PERFORM public.add_business_member(b,viewer,'viewer');
 INSERT INTO public.branches(business_id,code,name) VALUES(b,'A','Main') RETURNING id INTO br;
 INSERT INTO public.financial_periods(business_id,name,start_date,end_date) VALUES(b,'Open','2026-01-01','2026-12-31') RETURNING id INTO per;
 PERFORM public.set_branch_access(b,br,acc,true);
 PERFORM public.save_catalogue_variant(b,'[{"product_name":"Saree","sku":"AL-1","selling_price":1500}]'::jsonb);
 SELECT id INTO v FROM public.product_variants WHERE business_id=b;
 PERFORM public.post_stock_operation(b,gen_random_uuid(),v,br,NULL,'opening',50,'OPEN','Opening');
 INSERT INTO public.parties(business_id,kind,name) VALUES(b,'supplier','Sup') RETURNING id INTO sup;
 INSERT INTO public.parties(business_id,kind,name) VALUES(b,'customer','Cust') RETURNING id INTO cust;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',other_id,'role','authenticated')::text,true);
 ob:=public.create_business('Accounts B');

 -- Before any account exists, bank money from a normal sale is "unassigned" and the books are unchanged.
 PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
 doc:=public.post_commerce_document(jsonb_build_object('id',gen_random_uuid(),'businessId',b,'branchId',br,'periodId',per,'date','2026-11-01','mobile','9812345678','partyId',NULL,'sourceId',NULL,'kind','sale','status','confirmed','reference','S0','lines',jsonb_build_array(jsonb_build_object('variantId',v,'quantity',1,'price',1500,'discount',0,'taxRate',0)),'payments',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'method','bank','amount',1500,'sessionId',NULL,'reference','x'))));
 r:=public.account_balances(b);
 ASSERT (r->'unassigned'->>'bank')::numeric=1500 AND jsonb_array_length(r->'accounts')=0,'Untagged bank money shows as unassigned';

 -- Creating accounts with opening balances posts balanced journal entries.
 PERFORM public.create_payment_account(b,br,per,bank,'Himalayan Bank','bank',50000,'2026-11-02');
 PERFORM public.create_payment_account(b,br,per,wallet,'eSewa','wallet',0,'2026-11-02');
 PERFORM public.create_payment_account(b,br,per,safe,'Home Safe','cash',10000,'2026-11-02');
 r:=public.account_balances(b);
 ASSERT jsonb_array_length(r->'accounts')=3,'Three accounts';
 ASSERT (SELECT (x->>'balance')::numeric FROM jsonb_array_elements(r->'accounts') x WHERE x->>'name'='Himalayan Bank')=50000,'Bank opening balance';
 ASSERT (SELECT (x->>'balance')::numeric FROM jsonb_array_elements(r->'accounts') x WHERE x->>'name'='eSewa')=0,'Wallet starts at zero';
 ASSERT (r->'unassigned'->>'bank')::numeric=1500 AND (r->'unassigned'->>'cash')::numeric=0,'Opening balances do not disturb unassigned money';
 SELECT coalesce(sum(debit-credit),0) INTO gl FROM public.commerce_journal_entries WHERE business_id=b AND account_code='capital'; ASSERT gl=-60000,'Capital credited with the opening balances';
 SELECT coalesce(sum(debit-credit),0) INTO gl FROM public.commerce_journal_entries WHERE business_id=b; ASSERT gl=0,'Books still balance';
 ASSERT public.create_payment_account(b,br,per,bank,'himalayan bank','bank',50000,'2026-11-02')=bank,'Repeating a create is harmless';
 ASSERT (SELECT count(*) FROM public.account_movements WHERE account_id=bank)=1,'No second opening movement';
 denied:=false; BEGIN PERFORM public.create_payment_account(b,br,per,gen_random_uuid(),'HIMALAYAN BANK','bank',0,'2026-11-02'); EXCEPTION WHEN unique_violation THEN denied:=true; END; ASSERT denied,'Names are unique per business';
 denied:=false; BEGIN PERFORM public.create_payment_account(b,br,per,bank,'Other name','bank',1,'2026-11-02'); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Same id with different details refused';
 denied:=false; BEGIN PERFORM public.create_payment_account(b,br,per,gen_random_uuid(),'Bad','bank',-5,'2026-11-02'); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Negative opening refused';
 denied:=false; BEGIN PERFORM public.create_payment_account(b,br,per,gen_random_uuid(),'Bad','credit','0','2026-11-02'); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Unknown account type refused';

 -- Adjust balance up and down; replays do not double count.
 req:=jsonb_build_object('businessId',b,'branchId',br,'periodId',per,'id',gen_random_uuid(),'accountId',bank,'date','2026-11-03','target',60000);
 vid:=public.adjust_payment_account(req); ASSERT (SELECT coalesce(sum(amount),0) FROM public.account_movements WHERE account_id=bank)=60000,'Adjusted up';
 ASSERT public.adjust_payment_account(req)=vid AND (SELECT coalesce(sum(amount),0) FROM public.account_movements WHERE account_id=bank)=60000,'Replay changes nothing';
 PERFORM public.adjust_payment_account(req||jsonb_build_object('id',gen_random_uuid(),'target',55000)); ASSERT (SELECT coalesce(sum(amount),0) FROM public.account_movements WHERE account_id=bank)=55000,'Adjusted down';
 denied:=false; BEGIN PERFORM public.adjust_payment_account(req||jsonb_build_object('id',gen_random_uuid(),'target',55000)); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'No-op adjustment refused';
 SELECT coalesce(sum(debit-credit),0) INTO gl FROM public.commerce_journal_entries WHERE business_id=b AND account_code='bank'; ASSERT gl=55000+1500,'Books agree: bank 55000 tagged + 1500 untagged';

 -- Transfers between accounts: same-kind, cross-kind, and guarded.
 req:=jsonb_build_object('businessId',b,'branchId',br,'periodId',per,'id',gen_random_uuid(),'fromAccountId',bank,'toAccountId',safe,'amount',20000,'date','2026-11-04');
 vid:=public.transfer_between_accounts(req);
 ASSERT (SELECT coalesce(sum(amount),0) FROM public.account_movements WHERE account_id=bank)=35000 AND (SELECT coalesce(sum(amount),0) FROM public.account_movements WHERE account_id=safe)=30000,'Bank to safe';
 ASSERT public.transfer_between_accounts(req)=vid AND (SELECT coalesce(sum(amount),0) FROM public.account_movements WHERE account_id=safe)=30000,'Transfer replay changes nothing';
 PERFORM public.transfer_between_accounts(jsonb_build_object('businessId',b,'branchId',br,'periodId',per,'id',gen_random_uuid(),'fromAccountId',bank,'toAccountId',wallet,'amount',5000,'date','2026-11-04'));
 ASSERT (SELECT coalesce(sum(amount),0) FROM public.account_movements WHERE account_id=wallet)=5000,'Bank to wallet';
 SELECT coalesce(sum(debit-credit),0) INTO gl FROM public.commerce_journal_entries WHERE business_id=b; ASSERT gl=0,'Books balance after transfers';
 denied:=false; BEGIN PERFORM public.transfer_between_accounts(req||jsonb_build_object('id',gen_random_uuid(),'amount',99999)); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Cannot overdraw an account';
 denied:=false; BEGIN PERFORM public.transfer_between_accounts(req||jsonb_build_object('id',gen_random_uuid(),'toAccountId',bank)); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Cannot transfer to itself';
 denied:=false; BEGIN PERFORM public.transfer_between_accounts(req||jsonb_build_object('id',gen_random_uuid(),'amount',0)); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Zero transfer refused';

 -- Expenses: paying from the safe works (cash credit), and tags the right account.
 req:=jsonb_build_object('businessId',b,'branchId',br,'periodId',per,'id',gen_random_uuid(),'date','2026-11-05','reference','RENT-1','reason','Shop rent','kind','expense','lines',jsonb_build_array(jsonb_build_object('account','expense_rent','debit','4000','credit','0'),jsonb_build_object('account','cash','debit','0','credit','4000')));
 exp_id:=public.post_accounting_voucher_with_account(req,safe);
 ASSERT (SELECT coalesce(sum(amount),0) FROM public.account_movements WHERE account_id=safe)=26000,'Expense reduced the safe';
 ASSERT public.post_accounting_voucher_with_account(req,safe)=exp_id AND (SELECT coalesce(sum(amount),0) FROM public.account_movements WHERE account_id=safe)=26000,'Expense replay changes nothing';
 req:=req||jsonb_build_object('id',gen_random_uuid(),'reference','EL-1','lines',jsonb_build_array(jsonb_build_object('account','expense_utilities','debit','700','credit','0'),jsonb_build_object('account','wallet','debit','0','credit','700')));
 PERFORM public.post_accounting_voucher_with_account(req,wallet); ASSERT (SELECT coalesce(sum(amount),0) FROM public.account_movements WHERE account_id=wallet)=4300,'Expense from the wallet';
 denied:=false; BEGIN PERFORM public.post_accounting_voucher_with_account(req||jsonb_build_object('id',gen_random_uuid(),'reference','EL-2'),bank); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'A bank account cannot be tagged to a wallet expense';
 ASSERT (SELECT count(*) FROM public.accounting_vouchers WHERE business_id=b AND reference='EL-2')=0,'The refused expense was rolled back, not half-posted';
 denied:=false; BEGIN PERFORM public.post_accounting_voucher(jsonb_build_object('businessId',b,'branchId',br,'periodId',per,'id',gen_random_uuid(),'date','2026-11-05','reference','BAD','reason','x','kind','expense','lines',jsonb_build_array(jsonb_build_object('account','expense_rent','debit','10','credit','0'),jsonb_build_object('account','sales','debit','0','credit','10')))); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Protected accounts are still refused';

 -- Reversing a tagged expense puts the money back in the same account.
 vid2:=public.post_accounting_voucher(jsonb_build_object('businessId',b,'branchId',br,'periodId',per,'id',gen_random_uuid(),'date','2026-11-06','reference','REV-RENT','reason','Correct rent entry','kind','reversal','reversesId',exp_id));
 ASSERT (SELECT coalesce(sum(amount),0) FROM public.account_movements WHERE account_id=safe)=30000,'Reversal restores the safe';
 SELECT coalesce(sum(debit-credit),0) INTO gl FROM public.commerce_journal_entries WHERE business_id=b; ASSERT gl=0,'Books balance after reversal';

 -- Payments: sales and purchases tagged to named accounts; cash never is.
 pay:=gen_random_uuid();
 doc:=public.post_commerce_document_with_accounts(jsonb_build_object('id',gen_random_uuid(),'businessId',b,'branchId',br,'periodId',per,'date','2026-11-07','mobile','9812345678','partyId',NULL,'sourceId',NULL,'kind','sale','status','confirmed','reference','S1','lines',jsonb_build_array(jsonb_build_object('variantId',v,'quantity',1,'price',1500,'discount',0,'taxRate',0)),'payments',jsonb_build_array(jsonb_build_object('id',pay,'method','bank','amount',1500,'sessionId',NULL,'reference','x'))),jsonb_build_array(jsonb_build_object('paymentId',pay,'accountId',bank)));
 ASSERT (SELECT coalesce(sum(amount),0) FROM public.account_movements WHERE account_id=bank)=30000+1500,'Sale payment tagged to the bank account';
 denied:=false; BEGIN PERFORM public.post_commerce_document_with_accounts(jsonb_build_object('id',gen_random_uuid(),'businessId',b,'branchId',br,'periodId',per,'date','2026-11-07','mobile','9812345678','partyId',NULL,'sourceId',NULL,'kind','sale','status','confirmed','reference','S2','lines',jsonb_build_array(jsonb_build_object('variantId',v,'quantity',1,'price',1500,'discount',0,'taxRate',0)),'payments',jsonb_build_array(jsonb_build_object('id',pay2,'method','bank','amount',1500,'sessionId',NULL,'reference','x'))),jsonb_build_array(jsonb_build_object('paymentId',gen_random_uuid(),'accountId',bank))); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'A payment that is not in the document cannot be tagged';
 ASSERT (SELECT count(*) FROM public.commerce_documents WHERE business_id=b AND reference='S2')=0,'The refused sale was rolled back';
 pay2:=gen_random_uuid();
 denied:=false; BEGIN PERFORM public.post_commerce_document_with_accounts(jsonb_build_object('id',gen_random_uuid(),'businessId',b,'branchId',br,'periodId',per,'date','2026-11-07','mobile','9812345678','partyId',NULL,'sourceId',NULL,'kind','sale','status','confirmed','reference','S3','lines',jsonb_build_array(jsonb_build_object('variantId',v,'quantity',1,'price',1500,'discount',0,'taxRate',0)),'payments',jsonb_build_array(jsonb_build_object('id',pay2,'method','bank','amount',1500,'sessionId',NULL,'reference','x'))),jsonb_build_array(jsonb_build_object('paymentId',pay2,'accountId',wallet))); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Wallet account cannot take a bank payment';
 -- Party payment on credit, and a purchase paid out.
 doc:=public.post_commerce_document(jsonb_build_object('id',gen_random_uuid(),'businessId',b,'branchId',br,'periodId',per,'date','2026-11-08','mobile','9812345678','partyId',cust,'sourceId',NULL,'kind','sale','status','confirmed','reference','CR1','lines',jsonb_build_array(jsonb_build_object('variantId',v,'quantity',2,'price',1500,'discount',0,'taxRate',0)),'payments','[]'::jsonb));
 pay:=public.post_commerce_payment_with_account(jsonb_build_object('id',gen_random_uuid(),'businessId',b,'documentId',doc,'periodId',per,'date','2026-11-09','method','wallet','amount',1000,'sessionId',NULL,'reference','part'),wallet);
 ASSERT (SELECT coalesce(sum(amount),0) FROM public.account_movements WHERE account_id=wallet)=5300,'Customer payment tagged to the wallet';
 doc:=public.post_commerce_document(jsonb_build_object('id',gen_random_uuid(),'businessId',b,'branchId',br,'periodId',per,'date','2026-11-09','partyId',sup,'sourceId',NULL,'kind','purchase','status','confirmed','reference','P1','lines',jsonb_build_array(jsonb_build_object('variantId',v,'quantity',3,'price',1000,'discount',0,'taxRate',0)),'payments','[]'::jsonb));
 PERFORM public.post_commerce_payment_with_account(jsonb_build_object('id',gen_random_uuid(),'businessId',b,'documentId',doc,'periodId',per,'date','2026-11-09','method','bank','amount',2000,'sessionId',NULL,'reference','supplier'),bank);
 ASSERT (SELECT coalesce(sum(amount),0) FROM public.account_movements WHERE account_id=bank)=31500-2000,'Supplier payment reduces the bank account';
 SELECT coalesce(sum(debit-credit),0) INTO gl FROM public.commerce_journal_entries WHERE business_id=b; ASSERT gl=0,'Books balance after every posting';
 -- The named balances plus untagged money always add up to the books.
 r:=public.account_balances(b);
 SELECT coalesce(sum(debit-credit),0) INTO gl FROM public.commerce_journal_entries WHERE business_id=b AND account_code='bank';
 ASSERT gl=(SELECT coalesce(sum((x->>'balance')::numeric),0) FROM jsonb_array_elements(r->'accounts') x WHERE x->>'kind'='bank')+(r->'unassigned'->>'bank')::numeric,'Bank: accounts plus unassigned equal the books';

 -- Who may do what.
 FOREACH vid IN ARRAY ARRAY[staff,viewer,other_id] LOOP
   PERFORM set_config('request.jwt.claims',json_build_object('sub',vid,'role','authenticated')::text,true);
   denied:=false; BEGIN PERFORM public.account_balances(b); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Balances are for accountants and above';
   denied:=false; BEGIN PERFORM public.create_payment_account(b,br,per,gen_random_uuid(),'X','bank',0,'2026-11-02'); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Cannot create accounts';
   denied:=false; BEGIN PERFORM public.transfer_between_accounts(jsonb_build_object('businessId',b,'branchId',br,'periodId',per,'id',gen_random_uuid(),'fromAccountId',bank,'toAccountId',wallet,'amount',1,'date','2026-11-04')); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Cannot transfer';
   denied:=false; BEGIN PERFORM public.adjust_payment_account(jsonb_build_object('businessId',b,'branchId',br,'periodId',per,'id',gen_random_uuid(),'accountId',bank,'date','2026-11-04','target',1)); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Cannot adjust';
   ASSERT (SELECT count(*) FROM public.payment_accounts WHERE business_id=b)=0 AND (SELECT count(*) FROM public.account_movements WHERE business_id=b)=0,'Cannot read accounts or movements';
 END LOOP;
 -- Even an accountant cannot write the tables directly, or reach another business.
 PERFORM set_config('request.jwt.claims',json_build_object('sub',acc,'role','authenticated')::text,true);
 ASSERT (SELECT count(*) FROM public.payment_accounts WHERE business_id=b)=3,'Accountant can read accounts';
 denied:=false; BEGIN INSERT INTO public.account_movements(business_id,account_id,amount,source_type,source_id,entry_date) VALUES(b,bank,999,'voucher',gen_random_uuid(),'2026-11-01'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; ASSERT denied,'No direct writes to movements';
 denied:=false; BEGIN UPDATE public.payment_accounts SET name='Hacked' WHERE id=bank; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; ASSERT denied,'No direct edits to accounts';
 denied:=false; BEGIN PERFORM public.transfer_between_accounts(jsonb_build_object('businessId',ob,'branchId',br,'periodId',per,'id',gen_random_uuid(),'fromAccountId',bank,'toAccountId',wallet,'amount',1,'date','2026-11-04')); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Cannot reach another business';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',other_id,'role','authenticated')::text,true);
 denied:=false; BEGIN PERFORM public.transfer_between_accounts(jsonb_build_object('businessId',ob,'branchId',br,'periodId',per,'id',gen_random_uuid(),'fromAccountId',bank,'toAccountId',wallet,'amount',1,'date','2026-11-04')); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'Another business owner cannot use these accounts';
 RESET ROLE; RAISE EXCEPTION 'PAYMENT ACCOUNT TESTS PASSED';
END $tests$;
