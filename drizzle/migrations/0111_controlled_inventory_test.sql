-- One-time, tightly scoped production verification of the Auraluxe reserve/cancel path.
-- This function never commits a sale and removes its own reservation/outbox rows before commit.

CREATE TABLE public.website_inventory_controlled_test_runs (
  test_key text PRIMARY KEY CHECK (test_key = 'AL-KURTI-121-reserve-cancel'),
  status text NOT NULL CHECK (status IN ('pending','completed')),
  result jsonb,
  completed_at timestamptz
);
REVOKE ALL ON public.website_inventory_controlled_test_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.website_inventory_controlled_test_runs TO service_role;
ALTER TABLE public.website_inventory_controlled_test_runs ENABLE ROW LEVEL SECURITY;

INSERT INTO public.website_inventory_controlled_test_runs(test_key,status)
VALUES ('AL-KURTI-121-reserve-cancel','pending')
ON CONFLICT (test_key) DO NOTHING;

CREATE FUNCTION public.run_controlled_inventory_test()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business uuid := 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
  v_branch uuid := '4c534ce0-3ab5-46e4-8804-37cf0d72f8db';
  v_sku text := 'AL-KURTI-121';
  v_operation uuid := gen_random_uuid();
  v_reference text := 'CONTROLLED-TEST-' || gen_random_uuid()::text;
  v_variant uuid;
  v_matches integer;
  v_enabled boolean;
  v_bound_branch uuid;
  v_stock_before numeric;
  v_stock_after numeric;
  v_reserved jsonb;
  v_cancelled jsonb;
  v_existing integer;
  v_result jsonb;
  v_marker public.website_inventory_controlled_test_runs;
BEGIN
  PERFORM public.website_inventory_require_service();
  PERFORM pg_advisory_xact_lock(hashtextextended(v_business::text,0));

  SELECT * INTO v_marker
  FROM public.website_inventory_controlled_test_runs
  WHERE test_key = 'AL-KURTI-121-reserve-cancel'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Controlled inventory test marker is missing';
  END IF;
  IF v_marker.status = 'completed' THEN
    RETURN jsonb_build_object('ok',true,'skipped',true,'result',v_marker.result);
  END IF;

  SELECT enabled, branch_id INTO v_enabled, v_bound_branch
  FROM public.website_inventory_integrations
  WHERE business_id = v_business
  FOR UPDATE;

  IF NOT FOUND OR v_enabled IS DISTINCT FROM false OR v_bound_branch IS DISTINCT FROM v_branch THEN
    RAISE EXCEPTION 'Inventory integration is not in the expected disabled state';
  END IF;

  SELECT count(*) INTO v_matches
  FROM public.product_variants v
  JOIN public.products p ON p.business_id=v.business_id AND p.id=v.product_id
  WHERE v.business_id=v_business
    AND lower(btrim(v.sku))=lower(v_sku)
    AND v.is_active AND p.is_active;
  IF v_matches <> 1 THEN
    RAISE EXCEPTION 'Controlled test SKU is missing or ambiguous';
  END IF;

  SELECT v.id INTO v_variant
  FROM public.product_variants v
  JOIN public.products p ON p.business_id=v.business_id AND p.id=v.product_id
  WHERE v.business_id=v_business
    AND lower(btrim(v.sku))=lower(v_sku)
    AND v.is_active AND p.is_active
  LIMIT 1;

  v_stock_before := public.commerce_stock_balance(v_business,v_branch,v_variant);
  IF v_stock_before IS DISTINCT FROM 6::numeric THEN
    RAISE EXCEPTION 'Controlled test starting stock is not the approved quantity';
  END IF;

  SELECT count(*) INTO v_existing
  FROM public.website_inventory_reservations
  WHERE business_id=v_business;
  IF v_existing <> 0 THEN
    RAISE EXCEPTION 'Existing website reservations prevent an isolated test';
  END IF;
  SELECT count(*) INTO v_existing
  FROM public.website_inventory_outbox
  WHERE business_id=v_business;
  IF v_existing <> 0 THEN
    RAISE EXCEPTION 'Existing website outbox events prevent an isolated test';
  END IF;

  UPDATE public.website_inventory_integrations
  SET enabled=true, updated_at=now()
  WHERE business_id=v_business AND branch_id=v_branch AND enabled=false;

  v_reserved := public.reserve_website_inventory(
    v_business,
    v_operation,
    v_branch,
    v_reference,
    jsonb_build_array(jsonb_build_object('sku',v_sku,'quantity',1))
  );
  IF v_reserved->>'status' IS DISTINCT FROM 'reserved' THEN
    RAISE EXCEPTION 'The one-unit reservation did not complete';
  END IF;

  v_cancelled := public.finalize_website_inventory(
    v_business,
    v_operation,
    'cancel',
    v_reference || '-CANCEL'
  );
  IF v_cancelled->>'status' IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'The reservation cancellation did not complete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.website_inventory_reservations
    WHERE business_id=v_business AND id=v_operation AND status='cancelled'
  ) THEN
    RAISE EXCEPTION 'Reservation status did not persist as cancelled inside the transaction';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.website_inventory_movements
    WHERE business_id=v_business AND reservation_id=v_operation
  ) THEN
    RAISE EXCEPTION 'A cancellation unexpectedly created an on-hand stock movement';
  END IF;

  v_stock_after := public.commerce_stock_balance(v_business,v_branch,v_variant);
  IF v_stock_after IS DISTINCT FROM v_stock_before THEN
    RAISE EXCEPTION 'On-hand stock changed during the reserve/cancel test';
  END IF;

  -- Remove the test-only rows before commit. The outbox events are never visible
  -- to the scheduled publisher and therefore cannot be sent to Auraluxe.
  DELETE FROM public.website_inventory_outbox
  WHERE business_id=v_business AND reservation_id=v_operation;
  DELETE FROM public.website_inventory_reservation_items
  WHERE business_id=v_business AND reservation_id=v_operation;
  DELETE FROM public.website_inventory_reservations
  WHERE business_id=v_business AND id=v_operation AND status='cancelled';

  UPDATE public.website_inventory_integrations
  SET enabled=false, updated_at=now()
  WHERE business_id=v_business AND branch_id=v_branch;

  IF (SELECT enabled FROM public.website_inventory_integrations WHERE business_id=v_business) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Inventory integration was not restored to disabled';
  END IF;

  v_result := jsonb_build_object(
    'ok',true,
    'skipped',false,
    'sku',v_sku,
    'quantity',1,
    'status','cancelled',
    'startingStock',v_stock_before,
    'endingStock',v_stock_after,
    'integrationEnabled',false,
    'testRowsCleaned',true,
    'outboxPublished',false
  );

  UPDATE public.website_inventory_controlled_test_runs
  SET status='completed', result=v_result, completed_at=now()
  WHERE test_key='AL-KURTI-121-reserve-cancel';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.run_controlled_inventory_test() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_controlled_inventory_test() TO service_role;
