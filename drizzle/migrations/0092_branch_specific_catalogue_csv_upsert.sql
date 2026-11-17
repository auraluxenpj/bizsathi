-- 0092: branch-specific catalogue CSV upsert.
-- Existing SKU + model code rows update catalogue fields and set the selected branch's
-- on-hand quantity to the CSV target. New rows are created. Stock changes are posted
-- through the normal audited stock operation path.
CREATE OR REPLACE FUNCTION public.import_catalogue_branch_stock(
  _business_id uuid,
  _branch_id uuid,
  _rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_existing_model text;
  v_sku text;
  v_model text;
  v_variant_name text;
  v_target numeric;
  v_current numeric;
  v_delta numeric;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_adjusted integer := 0;
BEGIN
  IF NOT public.has_business_role(_business_id,'admin') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF NOT public.can_access_branch(_business_id,_branch_id)
     OR NOT EXISTS (
       SELECT 1 FROM public.branches
       WHERE business_id=_business_id AND id=_branch_id AND is_active
     ) THEN
    RAISE EXCEPTION 'You do not have access to the selected active branch';
  END IF;
  IF jsonb_typeof(_rows)<>'array' OR jsonb_array_length(_rows) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Expected 1 to 5000 rows';
  END IF;

  -- Serialize catalogue imports and stock adjustments for this business.
  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,0));

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_rows) item
    GROUP BY btrim(item->>'sku')
    HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'The CSV contains duplicate SKUs. Each variant must have one unique SKU.';
  END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
    v_sku := btrim(coalesce(r->>'sku',''));
    v_model := nullif(btrim(coalesce(r->>'model_code','')),'');
    v_variant_name := coalesce(nullif(btrim(r->>'variant_name'),''),'Standard');
    v_target := coalesce((r->>'opening_stock')::numeric,0);

    IF v_sku='' OR length(v_sku)>80 THEN
      RAISE EXCEPTION 'Every CSV row must have a valid SKU';
    END IF;
    IF v_target<0 OR v_target>999999999 OR v_target<>round(v_target,3)
       OR v_target::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Invalid branch quantity for SKU %',v_sku;
    END IF;

    INSERT INTO public.products(business_id,name,category)
    VALUES(_business_id,btrim(r->>'product_name'),coalesce(r->>'category',''))
    ON CONFLICT(business_id,name)
    DO UPDATE SET category=EXCLUDED.category
    RETURNING id INTO v_product_id;

    SELECT id,model_code INTO v_variant_id,v_existing_model
    FROM public.product_variants
    WHERE business_id=_business_id AND sku=v_sku
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing_model IS DISTINCT FROM v_model THEN
        RAISE EXCEPTION 'SKU % already exists with a different model code. Match both SKU and model code before importing.',v_sku;
      END IF;

      UPDATE public.product_variants
      SET product_id=v_product_id,
          name=v_variant_name,
          model_code=v_model,
          barcode=nullif(btrim(coalesce(r->>'barcode','')),''),
          unit=coalesce(nullif(btrim(r->>'unit'),''),'pcs'),
          selling_price=coalesce((r->>'selling_price')::numeric,0),
          purchase_price=coalesce((r->>'purchase_price')::numeric,0),
          mrp=coalesce((r->>'mrp')::numeric,0),
          wholesale_price=coalesce((r->>'wholesale_price')::numeric,0),
          reorder_level=coalesce((r->>'reorder_level')::numeric,0)
      WHERE business_id=_business_id AND id=v_variant_id;
      v_updated:=v_updated+1;
    ELSE
      INSERT INTO public.product_variants(
        business_id,product_id,name,sku,barcode,unit,selling_price,
        reorder_level,purchase_price,model_code,mrp,wholesale_price
      ) VALUES (
        _business_id,v_product_id,v_variant_name,v_sku,
        nullif(btrim(coalesce(r->>'barcode','')),''),
        coalesce(nullif(btrim(r->>'unit'),''),'pcs'),
        coalesce((r->>'selling_price')::numeric,0),
        coalesce((r->>'reorder_level')::numeric,0),
        coalesce((r->>'purchase_price')::numeric,0),
        v_model,
        coalesce((r->>'mrp')::numeric,0),
        coalesce((r->>'wholesale_price')::numeric,0)
      ) RETURNING id INTO v_variant_id;
      v_inserted:=v_inserted+1;
    END IF;

    v_current:=public.commerce_stock_balance(_business_id,_branch_id,v_variant_id);
    v_delta:=v_target-v_current;
    IF v_delta<>0 THEN
      PERFORM public.post_stock_operation(
        _business_id,
        gen_random_uuid(),
        v_variant_id,
        _branch_id,
        NULL,
        'adjustment',
        v_delta,
        'CSV stock import',
        format('CSV import set branch quantity to %s (previous quantity %s)',v_target,v_current)
      );
      v_adjusted:=v_adjusted+1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted',v_inserted,
    'updated',v_updated,
    'stock_adjusted',v_adjusted,
    'branch_id',_branch_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.import_catalogue_branch_stock(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_catalogue_branch_stock(uuid,uuid,jsonb) TO authenticated,service_role;
