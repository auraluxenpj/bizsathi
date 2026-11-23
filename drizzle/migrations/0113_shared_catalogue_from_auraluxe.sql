-- 0113: accept shared catalogue changes from Auraluxe by SKU.
-- No stock, sales, purchase, or movement history is changed by this catalogue RPC.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS catalogue_sizes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS catalogue_notes text,
  ADD COLUMN IF NOT EXISTS website_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auraluxe_product_id uuid;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS auraluxe_variant_id uuid,
  ADD COLUMN IF NOT EXISTS catalogue_notes text;

CREATE UNIQUE INDEX IF NOT EXISTS products_auraluxe_product_id_unique
  ON public.products(auraluxe_product_id) WHERE auraluxe_product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS variants_auraluxe_variant_id_unique
  ON public.product_variants(auraluxe_variant_id) WHERE auraluxe_variant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.upsert_shared_catalogue_from_auraluxe(
  _business_id uuid,
  _items jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r jsonb;
  v_sku text;
  v_name text;
  v_category text;
  v_unit text;
  v_model text;
  v_barcode text;
  v_product_id uuid;
  v_variant_id uuid;
  v_remote_product_id uuid;
  v_remote_variant_id uuid;
  v_sizes text[];
  v_purchase numeric;
  v_mrp numeric;
  v_price numeric;
  v_wholesale numeric;
  v_reorder numeric;
  v_created integer:=0;
  v_updated integer:=0;
BEGIN
  IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Server integration authentication required'; END IF;
  IF _business_id IS DISTINCT FROM 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid THEN
    RAISE EXCEPTION 'Unknown integration business';
  END IF;
  IF jsonb_typeof(_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(_items) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Expected 1 to 500 catalogue rows';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) e
     WHERE nullif(btrim(e.value->>'sku'),'') IS NULL
        OR length(btrim(e.value->>'sku'))>80
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) e
     GROUP BY lower(btrim(e.value->>'sku')) HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'SKU is required and unique within batch'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,2));
  FOR r IN SELECT value FROM jsonb_array_elements(_items) LOOP
    v_sku:=btrim(r->>'sku');
    v_name:=coalesce(nullif(btrim(r->>'name'),''),v_sku);
    v_category:=coalesce(nullif(btrim(r->>'category'),''),'');
    v_unit:=coalesce(nullif(btrim(r->>'unit'),''),'pcs');
    v_model:=nullif(btrim(r->>'model_code'),'');
    v_barcode:=nullif(btrim(r->>'barcode'),'');
    v_remote_product_id:=nullif(r->>'product_id','')::uuid;
    v_remote_variant_id:=nullif(r->>'variant_id','')::uuid;
    v_purchase:=coalesce(nullif(r->>'purchase_price','')::numeric,0);
    v_mrp:=coalesce(nullif(r->>'mrp','')::numeric,0);
    v_price:=coalesce(nullif(r->>'selling_price','')::numeric,0);
    v_wholesale:=coalesce(nullif(r->>'wholesale_price','')::numeric,0);
    v_reorder:=coalesce(nullif(r->>'reorder_level','')::numeric,0);
    SELECT coalesce(array_agg(btrim(x) ORDER BY ord),'{}'::text[])
      INTO v_sizes
      FROM jsonb_array_elements_text(coalesce(r->'sizes','[]'::jsonb)) WITH ORDINALITY s(x,ord)
     WHERE btrim(x)<>'';
    IF v_purchase<0 OR v_mrp<0 OR v_price<0 OR v_wholesale<0 OR v_reorder<0 THEN
      RAISE EXCEPTION 'Invalid price or reorder data for SKU %',v_sku;
    END IF;
    SELECT pv.id,pv.product_id INTO v_variant_id,v_product_id
      FROM public.product_variants pv
     WHERE pv.business_id=_business_id AND lower(btrim(pv.sku))=lower(v_sku)
     FOR UPDATE;
    IF v_variant_id IS NULL THEN
      SELECT p.id INTO v_product_id FROM public.products p
       WHERE p.business_id=_business_id AND EXISTS (
         SELECT 1 FROM public.product_variants pv
          WHERE pv.product_id=p.id AND pv.business_id=_business_id
            AND lower(btrim(pv.sku))=lower(v_sku)
       ) FOR UPDATE;
    END IF;
    IF v_product_id IS NULL THEN
      INSERT INTO public.products(business_id,name,category,is_active,catalogue_sizes,catalogue_notes,website_published,auraluxe_product_id)
      VALUES(_business_id,v_name,v_category,true,v_sizes,nullif(r->>'notes',''),coalesce((r->>'published')::boolean,false),v_remote_product_id)
      RETURNING id INTO v_product_id;
      INSERT INTO public.product_variants(business_id,product_id,name,sku,barcode,unit,selling_price,purchase_price,mrp,wholesale_price,reorder_level,model_code,auraluxe_variant_id,catalogue_notes)
      VALUES(_business_id,v_product_id,coalesce(nullif(r->>'variant_name',''),'Standard'),v_sku,v_barcode,v_unit,v_price,v_purchase,v_mrp,v_wholesale,v_reorder,v_model,v_remote_variant_id,nullif(r->>'notes',''))
      RETURNING id INTO v_variant_id;
      v_created:=v_created+1;
    ELSE
      UPDATE public.products SET name=v_name,category=v_category,catalogue_sizes=v_sizes,
        catalogue_notes=nullif(r->>'notes',''),
        website_published=coalesce((r->>'published')::boolean,website_published),
        auraluxe_product_id=coalesce(v_remote_product_id,auraluxe_product_id),
        updated_at=now() WHERE id=v_product_id;
      IF v_variant_id IS NULL THEN
        INSERT INTO public.product_variants(business_id,product_id,name,sku,barcode,unit,selling_price,purchase_price,mrp,wholesale_price,reorder_level,model_code,auraluxe_variant_id,catalogue_notes)
        VALUES(_business_id,v_product_id,coalesce(nullif(r->>'variant_name',''),'Standard'),v_sku,v_barcode,v_unit,v_price,v_purchase,v_mrp,v_wholesale,v_reorder,v_model,v_remote_variant_id,nullif(r->>'notes',''))
        RETURNING id INTO v_variant_id;
      ELSE
        UPDATE public.product_variants SET
          name=coalesce(nullif(r->>'variant_name',''),name),
          barcode=v_barcode,unit=v_unit,selling_price=v_price,purchase_price=v_purchase,
          mrp=v_mrp,wholesale_price=v_wholesale,reorder_level=v_reorder,model_code=v_model,
          auraluxe_variant_id=coalesce(v_remote_variant_id,auraluxe_variant_id),
          catalogue_notes=nullif(r->>'notes',''),updated_at=now()
         WHERE id=v_variant_id;
      END IF;
      v_updated:=v_updated+1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('created',v_created,'updated',v_updated,'identity_key','sku',
    'model_code_unique',false,'stock_changed',false,'history_preserved',true);
END $$;

REVOKE ALL ON FUNCTION public.upsert_shared_catalogue_from_auraluxe(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_shared_catalogue_from_auraluxe(uuid,jsonb) TO service_role;
