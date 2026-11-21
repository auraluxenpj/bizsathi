-- Isolated PostgreSQL integration test. Rolls back all synthetic fixture data.
BEGIN;

INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
VALUES ('e1070000-0000-4000-8000-000000000001','website-reservation-admin@example.invalid',now(),'{}',now(),now());
INSERT INTO public.platform_owners(user_id,note) VALUES ('e1070000-0000-4000-8000-000000000001','isolated website reservation regression fixture');

DO $setup_business$
DECLARE b uuid:='c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
BEGIN
  PERFORM set_config('bizsathi.skip_access_role_sync','on',true);
  INSERT INTO public.businesses(id,name,created_by)
    VALUES(b,'Website reservation fixture','e1070000-0000-4000-8000-000000000001');
  INSERT INTO public.business_memberships(business_id,user_id,role_code,status)
    VALUES(b,'e1070000-0000-4000-8000-000000000001','admin','active');
  INSERT INTO public.branches(business_id,code,name)
    VALUES(b,'WEB','Website test branch');
END
$setup_business$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e1070000-0000-4000-8000-000000000001","role":"authenticated"}',true);

DO $setup_stock$
DECLARE b uuid:='c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'; br uuid; v uuid;
BEGIN
  SELECT id INTO br FROM public.branches WHERE business_id=b AND code='WEB';
  PERFORM public.save_catalogue_variant(b,'[{"product_name":"Reservation test item","sku":"SKU-WEB-RESERVATION-TEST","selling_price":100}]');
  SELECT id INTO v FROM public.product_variants WHERE business_id=b AND sku='SKU-WEB-RESERVATION-TEST';
  PERFORM public.post_stock_operation(b,'e1070000-0000-4000-8000-000000000011',v,br,NULL,'opening',5,'WEB-OPEN','Test opening stock');
END
$setup_stock$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);

DO $reservation$
DECLARE
  b uuid; br uuid; v uuid;
  r1 uuid:='e1070000-0000-4000-8000-000000000021';
  r2 uuid:='e1070000-0000-4000-8000-000000000022';
  r3 uuid:='e1070000-0000-4000-8000-000000000023';
  r4 uuid:='e1070000-0000-4000-8000-000000000024';
  result jsonb; rejected boolean;
BEGIN
  SELECT id INTO b FROM public.businesses WHERE name='Website reservation fixture';
  SELECT id INTO br FROM public.branches WHERE business_id=b AND code='WEB';
  SELECT id INTO v FROM public.product_variants WHERE business_id=b AND sku='SKU-WEB-RESERVATION-TEST';
  INSERT INTO public.website_inventory_integrations(business_id,branch_id,enabled) VALUES(b,br,true)
    ON CONFLICT (business_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,enabled=true;

  result:=public.reserve_website_inventory(b,r1,br,'WEB-ORDER-1','[{"sku":"SKU-WEB-RESERVATION-TEST","quantity":4}]');
  ASSERT result->>'status'='reserved' AND result->>'duplicate'='false','Reservation is created';
  result:=public.reserve_website_inventory(b,r1,br,'WEB-ORDER-1','[{"sku":"sku-web-reservation-test","quantity":4}]');
  ASSERT result->>'duplicate'='true','Equivalent normalized retry is idempotent';

  rejected:=false;
  BEGIN
    PERFORM public.reserve_website_inventory(b,r2,br,'WEB-ORDER-2','[{"sku":"SKU-WEB-RESERVATION-TEST","quantity":2,"restockQuantity":1}]');
  EXCEPTION WHEN raise_exception THEN rejected:=true;
  END;
  ASSERT rejected,'Reservations cannot exceed available stock';

  result:=public.finalize_website_inventory(b,r1,'commit','WEB-ORDER-1-CONFIRMED');
  ASSERT result->>'status'='committed' AND result->>'duplicate'='false','Commit finalizes once';
  ASSERT public.commerce_stock_balance(b,br,v)=1,'Commit posts one on-hand deduction';
  result:=public.finalize_website_inventory(b,r1,'commit','WEB-ORDER-1-CONFIRMED');
  ASSERT result->>'duplicate'='true','Commit retry is idempotent';

  rejected:=false;
  BEGIN
    PERFORM public.finalize_website_inventory(b,r1,'commit','CHANGED-REFERENCE');
  EXCEPTION WHEN raise_exception THEN rejected:=true;
  END;
  ASSERT rejected,'Changed commit retry is rejected';

  result:=public.reserve_website_inventory(b,r3,br,'WEB-ORDER-3','[{"sku":"SKU-WEB-RESERVATION-TEST","quantity":1,"restockQuantity":1}]');
  ASSERT result->>'status'='reserved','Remaining unit can be reserved';
  result:=public.finalize_website_inventory(b,r3,'cancel','WEB-ORDER-3-CANCELLED');
  ASSERT result->>'status'='cancelled','Cancellation releases reservation';
  ASSERT public.commerce_stock_balance(b,br,v)=1,'Cancellation does not change on-hand';
  result:=public.finalize_website_inventory(b,r3,'cancel','WEB-ORDER-3-CANCELLED');
  ASSERT result->>'duplicate'='true','Cancellation retry is idempotent';

  result:=public.reserve_website_inventory(b,r4,br,'WEB-ORDER-4','[{"sku":"SKU-WEB-RESERVATION-TEST","quantity":1,"restockQuantity":1}]');
  ASSERT result->>'status'='reserved','Final unit can be reserved';
END
$reservation$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e1070000-0000-4000-8000-000000000001","role":"authenticated"}',true);

DO $native_sale_guard$
DECLARE b uuid; br uuid; v uuid; rejected boolean:=false;
BEGIN
  SELECT id INTO b FROM public.businesses WHERE name='Website reservation fixture';
  SELECT id INTO br FROM public.branches WHERE business_id=b AND code='WEB';
  SELECT id INTO v FROM public.product_variants WHERE business_id=b AND sku='SKU-WEB-RESERVATION-TEST';
  BEGIN
    PERFORM public.post_stock_operation(b,'e1070000-0000-4000-8000-000000000031',v,br,NULL,'adjustment',-1,'POS-OVER-RESERVE','Must not consume reserved unit');
  EXCEPTION WHEN raise_exception THEN rejected:=true;
  END;
  ASSERT rejected,'Native BizSathi stock writers cannot consume reserved stock';
  IF position('pg_advisory_xact_lock(hashtextextended(NEW.business_id::text,0))'
      IN pg_get_functiondef('public.guard_website_reserved_stock()'::regprocedure))=0 THEN
    RAISE EXCEPTION 'Native stock guard must share the reservation transaction lock';
  END IF;
END
$native_sale_guard$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);

DO $final_commit$
DECLARE b uuid; r1 uuid:='e1070000-0000-4000-8000-000000000021'; r3 uuid:='e1070000-0000-4000-8000-000000000023'; r4 uuid:='e1070000-0000-4000-8000-000000000024'; result jsonb; v uuid; br uuid; events jsonb; rejected boolean; claimed jsonb; event_id bigint; token1 uuid:='e1070000-0000-4000-8000-000000000051'; token2 uuid:='e1070000-0000-4000-8000-000000000052'; ok boolean;
BEGIN
  SELECT id INTO b FROM public.businesses WHERE name='Website reservation fixture';
  SELECT id INTO br FROM public.branches WHERE business_id=b AND code='WEB';
  SELECT id INTO v FROM public.product_variants WHERE business_id=b AND sku='SKU-WEB-RESERVATION-TEST';
  ASSERT public.commerce_stock_balance(b,br,v)=1,'Rejected native deduction leaves ledger unchanged';
  result:=public.finalize_website_inventory(b,r4,'commit','WEB-ORDER-4-CONFIRMED');
  ASSERT result->>'status'='committed','Commit succeeds after protected reservation';
  ASSERT public.commerce_stock_balance(b,br,v)=0,'Final on-hand is zero, never negative';

  result:=public.accept_website_inventory_return(
    b,'e1070000-0000-4000-8000-000000000041',r1,'WEB-RETURN-1',
    '[{"sku":"SKU-WEB-RESERVATION-TEST","quantity":2,"restockQuantity":1}]'
  );
  ASSERT result->>'status'='accepted' AND result->>'duplicate'='false','Partial return is accepted once';
  ASSERT public.commerce_stock_balance(b,br,v)=1,'Only sellable returned units are restocked';
  result:=public.accept_website_inventory_return(
    b,'e1070000-0000-4000-8000-000000000041',r1,'WEB-RETURN-1',
    '[{"sku":"sku-web-reservation-test","quantity":2,"restockQuantity":1}]'
  );
  ASSERT result->>'duplicate'='true','Return replay is idempotent and does not add stock twice';

  result:=public.accept_website_inventory_return(
    b,'e1070000-0000-4000-8000-000000000042',r1,'WEB-RETURN-2',
    '[{"sku":"SKU-WEB-RESERVATION-TEST","quantity":2,"restockQuantity":0}]'
  );
  ASSERT result->>'status'='accepted','Second partial return can complete the sold quantity';
  ASSERT public.commerce_stock_balance(b,br,v)=1,'Damaged returned units are recorded but not restocked';

  rejected:=false;
  BEGIN
    PERFORM public.accept_website_inventory_return(
      b,'e1070000-0000-4000-8000-000000000043',r1,'WEB-RETURN-3',
      '[{"sku":"SKU-WEB-RESERVATION-TEST","quantity":1,"restockQuantity":1}]'
    );
  EXCEPTION WHEN raise_exception THEN rejected:=true;
  END;
  ASSERT rejected,'Accepted returns cannot exceed the original sold quantity';

  rejected:=false;
  BEGIN
    PERFORM public.accept_website_inventory_return(
      b,'e1070000-0000-4000-8000-000000000044',r3,'WEB-RETURN-CANCELLED',
      '[{"sku":"SKU-WEB-RESERVATION-TEST","quantity":1,"restockQuantity":1}]'
    );
  EXCEPTION WHEN raise_exception THEN rejected:=true;
  END;
  ASSERT rejected,'Cancelled website orders cannot be returned into stock';

  events:=public.read_website_inventory_outbox(b,0,100);
  ASSERT jsonb_array_length(events)=8,'Reserve, commit, cancel and accepted-return events are retained';

  claimed:=public.claim_website_inventory_outbox(b,token1,1);
  ASSERT jsonb_array_length(claimed)=1,'A publisher can lease the oldest pending event';
  event_id:=(claimed->0->>'id')::bigint;
  -- Later events must not leapfrog an active earlier projection.
  claimed:=public.claim_website_inventory_outbox(b,token2,1);
  ASSERT jsonb_array_length(claimed)=0,'A concurrent publisher cannot claim a later event while the oldest event is leased';
  ok:=public.ack_website_inventory_outbox_event(b,event_id,token2);
  ASSERT NOT ok,'An incorrect lease token cannot acknowledge an event';
  ok:=public.fail_website_inventory_outbox_event(b,event_id,token1,'simulated delivery failure');
  ASSERT ok,'The lease owner can release a failed event into backoff';
  claimed:=public.claim_website_inventory_outbox(b,token2,1);
  ASSERT jsonb_array_length(claimed)=0,'Failed events respect retry backoff';
  UPDATE public.website_inventory_outbox SET next_attempt_at=now()-interval '1 second'
   WHERE business_id=b AND id=event_id;
  claimed:=public.claim_website_inventory_outbox(b,token2,1);
  ASSERT jsonb_array_length(claimed)=1,'An event becomes claimable after its retry time';
  ok:=public.ack_website_inventory_outbox_event(b,event_id,token2);
  ASSERT ok,'The current lease owner can acknowledge a delivered event';
  events:=public.read_website_inventory_outbox(b,0,100);
  ASSERT jsonb_array_length(events)=7,'Acknowledged events are removed from the pending view';
  ASSERT public.ack_website_inventory_outbox(b,(events->6->>'id')::bigint)=7,'Legacy cursor acknowledgement remains compatible';
  ASSERT (public.website_inventory_status(b,r4)->>'status')='committed','Uncertain operation status can be reconciled';
END
$final_commit$;

ROLLBACK;
