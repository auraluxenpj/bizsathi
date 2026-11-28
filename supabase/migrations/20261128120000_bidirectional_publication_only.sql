-- Bidirectional publication-only sync. Keep operational catalogue and stock
-- authority unchanged. Publication events are a separate outbox message type.

CREATE OR REPLACE FUNCTION public.enqueue_auraluxe_catalogue_from_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v record;
BEGIN
  IF current_setting('app.catalogue_sync_origin',true)='auraluxe' THEN RETURN NEW; END IF;
  IF NEW.business_id<>'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid THEN RETURN NEW; END IF;

  -- Existing operational catalogue events continue unchanged.
  FOR v IN SELECT id FROM public.product_variants
    WHERE business_id=NEW.business_id AND product_id=NEW.id ORDER BY id
  LOOP
    PERFORM public.enqueue_auraluxe_catalogue_variant(v.id);
  END LOOP;

  -- Publication-only event: no price, stock, or product fields are applied.
  IF TG_OP='UPDATE' AND NEW.website_published IS DISTINCT FROM OLD.website_published THEN
    FOR v IN SELECT id, sku, auraluxe_variant_id FROM public.product_variants
      WHERE business_id=NEW.business_id AND product_id=NEW.id
        AND auraluxe_variant_id IS NOT NULL AND nullif(btrim(sku),'') IS NOT NULL
      ORDER BY id
    LOOP
      INSERT INTO public.auraluxe_catalogue_outbox(business_id,sku,payload)
      VALUES (NEW.business_id,v.sku,jsonb_build_object(
        'publication_only',true,
        'bizsathi_product_id',NEW.id,
        'bizsathi_variant_id',v.id,
        'auraluxe_product_id',NEW.auraluxe_product_id,
        'auraluxe_variant_id',v.auraluxe_variant_id,
        'sku',v.sku,
        'published',NEW.website_published
      ));
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_auraluxe_publication_outbox(
  _business_id uuid, _lease uuid, _limit integer DEFAULT 50
)
RETURNS SETOF public.auraluxe_catalogue_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role'
     OR _business_id <> 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid
     OR _lease IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Service authorization and valid lease required';
  END IF;
  RETURN QUERY
  WITH picked AS (
    SELECT o.id FROM public.auraluxe_catalogue_outbox o
     WHERE o.business_id=_business_id
       AND o.payload->>'publication_only'='true'
       AND ((o.status='pending' AND o.available_at<=now())
         OR (o.status='processing' AND o.locked_until<now()))
     ORDER BY o.id FOR UPDATE SKIP LOCKED LIMIT _limit
  )
  UPDATE public.auraluxe_catalogue_outbox o
     SET status='processing',lease_token=_lease,
         locked_until=now()+interval '2 minutes',attempts=attempts+1
    FROM picked WHERE o.id=picked.id
  RETURNING o.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_auraluxe_publication_outbox(uuid,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auraluxe_publication_outbox(uuid,uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_auraluxe_publication(
  _business_id uuid, _auraluxe_product_id uuid, _auraluxe_variant_id uuid, _sku text, _published boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_product_id uuid;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' OR auth.uid() IS NOT NULL
     OR _business_id <> 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid
     OR _auraluxe_product_id IS NULL OR _auraluxe_variant_id IS NULL
     OR nullif(btrim(_sku),'') IS NULL OR _published IS NULL THEN
    RAISE EXCEPTION 'Authorized publication event required';
  END IF;
  SELECT p.id INTO v_product_id
    FROM public.products p
    JOIN public.product_variants pv
      ON pv.product_id=p.id AND pv.business_id=p.business_id
   WHERE p.business_id=_business_id
     AND p.auraluxe_product_id=_auraluxe_product_id
     AND pv.auraluxe_variant_id=_auraluxe_variant_id
     AND lower(btrim(pv.sku))=lower(btrim(_sku))
   FOR UPDATE OF p;
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Publication event SKU or cross-system mapping does not match';
  END IF;
  PERFORM set_config('app.catalogue_sync_origin','auraluxe',true);
  UPDATE public.products SET website_published=_published, updated_at=now()
   WHERE id=v_product_id AND business_id=_business_id;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_auraluxe_publication(uuid,uuid,uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_auraluxe_publication(uuid,uuid,uuid,text,boolean) TO service_role;

-- The standard catalogue publisher must never consume publication-only events.
DO $$
DECLARE d text; original text;
BEGIN
  original := pg_get_functiondef('public.claim_auraluxe_catalogue_outbox(uuid,uuid,integer)'::regprocedure);
  IF position('candidate.payload->>''publication_only'' IS DISTINCT FROM ''true''' in original) > 0 THEN RETURN; END IF;
  d := replace(original,
    'WHERE candidate.business_id = _business_id',
    'WHERE candidate.business_id = _business_id AND candidate.payload->>''publication_only'' IS DISTINCT FROM ''true''');
  IF d=original THEN RAISE EXCEPTION 'Could not isolate publication events from the operational catalogue queue'; END IF;
  EXECUTE d;
END $$;
