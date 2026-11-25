-- 0126: Reconcile obsolete Auraluxe catalogue events and safely enable current SKU sync.
-- The claim function repeats the stale-SKU guard on every run so deleted/removed
-- BizSathi variants cannot later be recreated on Auraluxe from an old snapshot.
DO $safe_catalogue_claim$
DECLARE
  body text;
  changed text;
  anchor text := 'PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text, 0));';
  guard_sql text := E'\n  UPDATE public.auraluxe_catalogue_outbox stale\n     SET status = ''superseded'',\n         last_error = ''Superseded: SKU is no longer present in the active BizSathi catalogue'',\n         lease_token = NULL,\n         locked_until = NULL\n   WHERE stale.business_id = _business_id\n     AND stale.status IN (''pending'', ''processing'')\n     AND NOT EXISTS (\n       SELECT 1 FROM public.product_variants active_variant\n        WHERE active_variant.business_id = stale.business_id\n          AND lower(btrim(active_variant.sku)) = lower(btrim(stale.sku))\n     );';
BEGIN
  SELECT pg_get_functiondef('public.claim_auraluxe_catalogue_outbox(uuid,uuid,integer)'::regprocedure)
    INTO body;
  IF position(anchor in body) = 0 THEN
    RAISE EXCEPTION 'Could not locate catalogue claim serialization lock';
  END IF;
  changed := replace(body, anchor, anchor || guard_sql);
  IF changed = body OR position('SKU is no longer present in the active BizSathi catalogue' in changed) = 0 THEN
    RAISE EXCEPTION 'Could not install stale SKU claim guard';
  END IF;
  EXECUTE changed;
END
$safe_catalogue_claim$;

UPDATE public.auraluxe_catalogue_outbox stale
   SET status = 'superseded',
       last_error = 'Superseded during reconciliation: SKU is no longer present in the active BizSathi catalogue',
       lease_token = NULL,
       locked_until = NULL
 WHERE stale.business_id = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid
   AND stale.status IN ('pending', 'processing')
   AND NOT EXISTS (
     SELECT 1 FROM public.product_variants active_variant
      WHERE active_variant.business_id = stale.business_id
        AND lower(btrim(active_variant.sku)) = lower(btrim(stale.sku))
   );

DO $enable_current_catalogue_sync$
BEGIN
  UPDATE public.auraluxe_sync_control
     SET catalogue_enabled = true, updated_at = now()
   WHERE business_id = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auraluxe catalogue sync control row is missing';
  END IF;
END
$enable_current_catalogue_sync$;
