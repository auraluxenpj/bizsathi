-- 0127: retain stock movements created before the Auraluxe SKU mapping is ready.
-- Stock is still movement-driven; this does not import or overwrite any quantity.
-- Unmapped stock events remain pending and become publishable when the catalogue mapping arrives.

ALTER TABLE public.auraluxe_stock_outbox
  ALTER COLUMN auraluxe_product_id DROP NOT NULL,
  ALTER COLUMN auraluxe_variant_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.enqueue_auraluxe_stock_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  row_data jsonb := to_jsonb(NEW);
  source_business uuid;
  source_branch uuid;
  source_id uuid;
  source_variant uuid;
  source_product uuid;
  source_sku text;
  remote_product uuid;
  remote_variant uuid;
  version_no bigint;
  delta_qty numeric;
  occurred timestamptz;
  event_uuid uuid;
  enabled boolean;
BEGIN
  IF current_setting('app.stock_sync_origin',true)='auraluxe' THEN
    RETURN NEW;
  END IF;

  source_business := (row_data->>'business_id')::uuid;
  IF source_business <> 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid THEN
    RETURN NEW;
  END IF;

  SELECT stock_enabled INTO enabled
    FROM public.auraluxe_sync_control
   WHERE business_id=source_business;
  IF NOT coalesce(enabled,false) THEN
    RETURN NEW;
  END IF;

  source_branch := (row_data->>'branch_id')::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM public.website_inventory_integrations i
     WHERE i.business_id=source_business
       AND i.branch_id=source_branch
       AND i.enabled
  ) THEN
    RAISE EXCEPTION 'Auraluxe stock sync is enabled but this BizSathi branch is not mapped to the website';
  END IF;

  source_id := (row_data->>'id')::uuid;
  source_variant := (row_data->>'variant_id')::uuid;
  delta_qty := (row_data->>'quantity')::numeric;
  occurred := coalesce((row_data->>'created_at')::timestamptz,now());

  IF source_id IS NULL OR source_variant IS NULL
     OR delta_qty IS NULL OR delta_qty=0
     OR delta_qty<>trunc(delta_qty) OR abs(delta_qty)>1000000 THEN
    RAISE EXCEPTION 'Auraluxe stock sync requires a non-zero whole-unit movement of at most 1,000,000 units';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.auraluxe_stock_outbox
     WHERE business_id=source_business
       AND source_table=TG_TABLE_NAME
       AND source_id=source_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT v.sku,v.auraluxe_variant_id,p.auraluxe_product_id,v.product_id
    INTO source_sku,remote_variant,remote_product,source_product
    FROM public.product_variants v
    JOIN public.products p
      ON p.business_id=v.business_id AND p.id=v.product_id
   WHERE v.business_id=source_business
     AND v.id=source_variant;

  IF NOT FOUND OR nullif(btrim(source_sku),'') IS NULL THEN
    RAISE EXCEPTION 'Stock movement SKU/variant could not be resolved in BizSathi';
  END IF;

  -- Normalize the event stream key so SKU case edits cannot restart versioning.
  source_sku := lower(btrim(source_sku));
  event_uuid := gen_random_uuid();

  INSERT INTO public.auraluxe_stock_sync_versions(business_id,sku,last_version)
  VALUES(source_business,source_sku,1)
  ON CONFLICT(business_id,sku) DO UPDATE
    SET last_version=public.auraluxe_stock_sync_versions.last_version+1,
        updated_at=now()
  RETURNING last_version INTO version_no;

  INSERT INTO public.auraluxe_stock_outbox(
    event_id,business_id,branch_id,sku,sku_version,source_table,source_id,
    bizsathi_product_id,bizsathi_variant_id,auraluxe_product_id,auraluxe_variant_id,
    delta,occurred_at,payload,status,last_error
  ) VALUES (
    event_uuid,source_business,source_branch,source_sku,version_no,TG_TABLE_NAME,source_id,
    source_product,source_variant,remote_product,remote_variant,
    delta_qty,occurred,
    jsonb_build_object(
      'eventId',event_uuid,
      'sourceTable',TG_TABLE_NAME,
      'sourceId',source_id,
      'businessId',source_business,
      'branchId',source_branch,
      'sku',source_sku,
      'skuVersion',version_no,
      'delta',delta_qty,
      'bizsathiProductId',source_product,
      'bizsathiVariantId',source_variant,
      'auraluxeProductId',remote_product,
      'auraluxeVariantId',remote_variant,
      'occurredAt',occurred
    ),
    'pending',NULL
  );

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.claim_auraluxe_stock_outbox(
  _business_id uuid,
  _lease uuid,
  _limit integer DEFAULT 25
)
RETURNS SETOF public.auraluxe_stock_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF coalesce(auth.role(),'')<>'service_role'
     OR _business_id<>'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid
     OR _lease IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Service authorization and valid lease required';
  END IF;

  IF NOT coalesce((SELECT stock_enabled FROM public.auraluxe_sync_control WHERE business_id=_business_id),false)
     OR NOT EXISTS (
       SELECT 1 FROM public.website_inventory_integrations
        WHERE business_id=_business_id AND enabled
     ) THEN
    RETURN;
  END IF;

  -- Resolve delayed cross-system IDs after the catalogue publisher has created
  -- the website SKU. The immutable BizSathi event remains queued until then.
  UPDATE public.auraluxe_stock_outbox o
     SET auraluxe_product_id=p.auraluxe_product_id,
         auraluxe_variant_id=v.auraluxe_variant_id,
         payload=jsonb_set(
           jsonb_set(o.payload,'{auraluxeProductId}',to_jsonb(p.auraluxe_product_id)),
           '{auraluxeVariantId}',to_jsonb(v.auraluxe_variant_id)
         )
    FROM public.products p
    JOIN public.product_variants v
      ON v.business_id=p.business_id AND v.product_id=p.id
   WHERE o.business_id=_business_id
     AND o.bizsathi_product_id=p.id
     AND o.bizsathi_variant_id=v.id
     AND lower(btrim(o.sku))=lower(btrim(v.sku))
     AND p.auraluxe_product_id IS NOT NULL
     AND v.auraluxe_variant_id IS NOT NULL
     AND (o.auraluxe_product_id IS NULL OR o.auraluxe_variant_id IS NULL)
     AND o.status IN ('pending','processing');

  RETURN QUERY
  WITH picked AS (
    SELECT o.id
      FROM public.auraluxe_stock_outbox o
     WHERE o.business_id=_business_id
       AND o.auraluxe_product_id IS NOT NULL
       AND o.auraluxe_variant_id IS NOT NULL
       AND (
         (o.status='pending' AND o.available_at<=now())
         OR (o.status='processing' AND o.locked_until<now())
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.auraluxe_stock_outbox earlier
          WHERE earlier.business_id=o.business_id
            AND earlier.sku=o.sku
            AND earlier.sku_version<o.sku_version
            AND earlier.status<>'delivered'
       )
     ORDER BY o.id
     FOR UPDATE SKIP LOCKED
     LIMIT _limit
  )
  UPDATE public.auraluxe_stock_outbox o
     SET status='processing',
         lease_token=_lease,
         locked_until=now()+interval '2 minutes',
         attempts=attempts+1
    FROM picked
   WHERE o.id=picked.id
  RETURNING o.*;
END
$function$;

CREATE OR REPLACE FUNCTION public.fail_auraluxe_stock_outbox(
  _id bigint,
  _lease uuid,
  _error text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN
    RAISE EXCEPTION 'Service authorization required';
  END IF;

  -- Never discard a valid movement after an arbitrary retry count. Temporary
  -- outages, delayed SKU mappings and missing opening baselines must remain
  -- recoverable; the per-SKU version guard prevents later events overtaking it.
  UPDATE public.auraluxe_stock_outbox
     SET status='pending',
         available_at=now()+make_interval(secs=>least(3600,power(2,least(attempts,10))::integer*5)),
         lease_token=NULL,
         locked_until=NULL,
         last_error=left(coalesce(_error,'stock event delivery failed'),1000)
   WHERE id=_id
     AND status='processing'
     AND lease_token=_lease;
  RETURN FOUND;
END
$function$;

-- When a delayed catalogue mapping is persisted, attach it to any stock events
-- already waiting for that exact BizSathi product/variant/SKU identity.
DO $resolve_stock_mapping_after_catalogue$
DECLARE
  body text;
  anchor text := 'UPDATE public.product_variants SET auraluxe_variant_id=av WHERE business_id=_business_id AND id=variant_id;';
  addition text := $patch$
    UPDATE public.auraluxe_stock_outbox o
       SET auraluxe_product_id=ap,
           auraluxe_variant_id=av,
           payload=jsonb_set(
             jsonb_set(o.payload,'{auraluxeProductId}',to_jsonb(ap)),
             '{auraluxeVariantId}',to_jsonb(av)
           )
     WHERE o.business_id=_business_id
       AND o.bizsathi_product_id=bp
       AND o.bizsathi_variant_id=bv
       AND lower(btrim(o.sku))=v_sku
       AND o.status IN ('pending','processing');
$patch$;
  changed text;
BEGIN
  SELECT pg_get_functiondef('public.upsert_auraluxe_catalogue_mappings(uuid,jsonb)'::regprocedure)
    INTO body;
  IF position(anchor in body)=0 THEN
    RAISE EXCEPTION 'Could not locate catalogue mapping update for delayed stock events';
  END IF;
  IF position('UPDATE public.auraluxe_stock_outbox o' in body)>0 THEN
    RETURN;
  END IF;
  changed:=replace(body,anchor,anchor||E'\n'||addition);
  IF changed=body OR position('UPDATE public.auraluxe_stock_outbox o' in changed)=0 THEN
    RAISE EXCEPTION 'Could not install delayed stock mapping resolution';
  END IF;
  EXECUTE changed;
END
$resolve_stock_mapping_after_catalogue$;

REVOKE ALL ON FUNCTION public.enqueue_auraluxe_stock_event() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_auraluxe_stock_outbox(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fail_auraluxe_stock_outbox(bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auraluxe_stock_outbox(uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_auraluxe_stock_outbox(bigint,uuid,text) TO service_role;

COMMENT ON TABLE public.auraluxe_stock_outbox IS
  'Immutable BizSathi stock movements. Events remain pending until the matching Auraluxe SKU mapping and opening baseline are ready; failed delivery is retried without discarding the event.';
