-- BizSathi is the only catalogue authority for the Auraluxe storefront.
-- Inactive BizSathi products/variants must be sent as unpublished.
DO $test$
DECLARE
  enqueue_body text;
  snapshot_body text;
  product_trigger text;
  variant_trigger text;
BEGIN
  SELECT pg_get_functiondef('public.enqueue_auraluxe_catalogue_variant(uuid)'::regprocedure)
    INTO enqueue_body;
  SELECT pg_get_functiondef('public.get_auraluxe_catalogue_snapshot(uuid)'::regprocedure)
    INTO snapshot_body;
  SELECT pg_get_triggerdef(oid) INTO product_trigger
    FROM pg_trigger WHERE tgname='auraluxe_catalogue_product_outbox' AND NOT tgisinternal;
  SELECT pg_get_triggerdef(oid) INTO variant_trigger
    FROM pg_trigger WHERE tgname='auraluxe_catalogue_variant_outbox' AND NOT tgisinternal;

  IF position('p.website_published AND p.is_active AND v.is_active' IN enqueue_body)=0 THEN
    RAISE EXCEPTION 'Incremental BizSathi catalogue events must publish only active products and variants';
  END IF;
  IF position('p.website_published AND p.is_active AND v.is_active' IN snapshot_body)=0 THEN
    RAISE EXCEPTION 'Full BizSathi snapshot must publish only active products and variants';
  END IF;
  IF product_trigger IS NULL OR position('is_active' IN product_trigger)=0 THEN
    RAISE EXCEPTION 'Product activation changes must enqueue catalogue events';
  END IF;
  IF variant_trigger IS NULL OR position('is_active' IN variant_trigger)=0 THEN
    RAISE EXCEPTION 'Variant activation changes must enqueue catalogue events';
  END IF;
  IF NOT coalesce((SELECT catalogue_enabled FROM public.auraluxe_sync_control
    WHERE business_id='c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid),false) THEN
    RAISE EXCEPTION 'Owner-approved catalogue sync must remain enabled';
  END IF;
  IF coalesce((SELECT stock_enabled FROM public.auraluxe_sync_control
    WHERE business_id='c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid),true) THEN
    RAISE EXCEPTION 'Stock sync must remain disabled until baseline approval';
  END IF;
END
$test$;
