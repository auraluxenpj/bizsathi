-- 0123: Google Sheets is the source of truth for catalogue fields and selected-branch stock.
-- Stock is reconciled to the sheet's absolute Master Qty, never added on top.
DROP FUNCTION IF EXISTS public.import_catalogue_branch_stock(uuid,uuid,jsonb);
CREATE OR REPLACE FUNCTION public.import_catalogue_branch_stock(
  _business_id uuid,
  _branch_id uuid,
  _rows jsonb,
  _sync_stock boolean DEFAULT false
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
  v_sku text;
  v_model text;
  v_variant_name text;
  v_name text;
  v_category text;
  v_sizes text[];
  v_target numeric;
  v_current numeric;
  v_delta numeric;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_adjusted integer := 0;
  v_added numeric := 0;
  v_removed numeric := 0;
  v_can_manage_cost boolean := false;
BEGIN
  IF NOT public.has_business_role(_business_id,'admin') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF NOT public.has_permission(_business_id,'features.import') THEN
    RAISE EXCEPTION 'CSV import permission required';
  END IF;
  v_can_manage_cost := public.has_permission(_business_id,'other.purchase_price');
  IF NOT public.can_access_branch(_business_id,_branch_id)
     OR NOT EXISTS (SELECT 1 FROM public.branches WHERE business_id=_business_id AND id=_branch_id AND is_active) THEN
    RAISE EXCEPTION 'You do not have access to the selected active branch';
  END IF;
  IF jsonb_typeof(_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(_rows) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Expected 1 to 5000 rows';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_rows) e
    WHERE nullif(btrim(e.value->>'sku'),'') IS NULL OR length(btrim(e.value->>'sku'))>80
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(_rows) e
    GROUP BY lower(btrim(e.value->>'sku')) HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'SKU is required and must appear once per import';
  END IF;
  IF _sync_stock AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(_rows) e
    WHERE CASE
      WHEN nullif(btrim(e.value->>'opening_stock'),'') IS NULL THEN true
      WHEN btrim(e.value->>'opening_stock') ~ '^[0-9]+([.][0-9]{1,3})?$'
        THEN (e.value->>'opening_stock')::numeric > 999999999
      ELSE true
    END
  ) THEN
    RAISE EXCEPTION 'Every Google Sheets row must contain a valid non-negative Master Qty with at most 3 decimals';
  END IF;

  -- Serialize catalogue writes and stock reconciliation across concurrent imports.
  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,0));

  FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
    v_sku := btrim(r->>'sku');
    v_model := nullif(btrim(r->>'model_code'),'');
    v_variant_name := coalesce(nullif(btrim(r->>'variant_name'),''),'Standard');
    v_name := coalesce(nullif(btrim(r->>'product_name'),''),v_sku);
    v_category := coalesce(nullif(btrim(r->>'category'),''),'');
    v_target := coalesce((r->>'opening_stock')::numeric,0);

    SELECT coalesce(array_agg(DISTINCT btrim(x) ORDER BY btrim(x)),'{}'::text[])
      INTO v_sizes
      FROM regexp_split_to_table(coalesce(r->>'sizes',''),',') x
     WHERE btrim(x)<>'';

    SELECT pv.id,pv.product_id INTO v_variant_id,v_product_id
      FROM public.product_variants pv
     WHERE pv.business_id=_business_id AND lower(btrim(pv.sku))=lower(v_sku)
     FOR UPDATE;

    IF v_variant_id IS NULL THEN
      INSERT INTO public.products(business_id,name,category,catalogue_sizes)
      VALUES(_business_id,v_name,v_category,v_sizes)
      RETURNING id INTO v_product_id;
      INSERT INTO public.product_variants(
        business_id,product_id,name,sku,barcode,unit,selling_price,reorder_level,
        purchase_price,model_code,mrp,wholesale_price
      ) VALUES (
        _business_id,v_product_id,v_variant_name,v_sku,
        nullif(btrim(r->>'barcode'),''),coalesce(nullif(btrim(r->>'unit'),''),'pcs'),
        coalesce((r->>'selling_price')::numeric,0),coalesce((r->>'reorder_level')::numeric,0),
        CASE WHEN v_can_manage_cost THEN coalesce((r->>'purchase_price')::numeric,0) ELSE 0 END,
        v_model,coalesce((r->>'mrp')::numeric,0),coalesce((r->>'wholesale_price')::numeric,0)
      ) RETURNING id INTO v_variant_id;
      v_inserted := v_inserted+1;
    ELSE
      UPDATE public.products
         SET name=v_name,category=v_category,catalogue_sizes=v_sizes,updated_at=now()
       WHERE business_id=_business_id AND id=v_product_id;
      UPDATE public.product_variants
         SET name=v_variant_name,
             barcode=nullif(btrim(r->>'barcode'),''),
             unit=coalesce(nullif(btrim(r->>'unit'),''),'pcs'),
             selling_price=coalesce((r->>'selling_price')::numeric,0),
             purchase_price=CASE WHEN v_can_manage_cost THEN coalesce((r->>'purchase_price')::numeric,0) ELSE purchase_price END,
             model_code=v_model,
             mrp=coalesce((r->>'mrp')::numeric,0),
             wholesale_price=coalesce((r->>'wholesale_price')::numeric,0),
             reorder_level=coalesce((r->>'reorder_level')::numeric,0),
             updated_at=now()
       WHERE business_id=_business_id AND id=v_variant_id;
      v_updated := v_updated+1;
    END IF;

    IF _sync_stock THEN
      v_current := public.commerce_stock_balance(_business_id,_branch_id,v_variant_id);
      v_delta := v_target-v_current;
      IF v_delta<>0 THEN
        PERFORM public.post_stock_operation(
          _business_id,gen_random_uuid(),v_variant_id,_branch_id,NULL,'adjustment',v_delta,
          'Google Sheets master sync',
          format('Google Sheets Master Qty set branch quantity to %s (previous quantity %s)',v_target,v_current)
        );
        v_adjusted := v_adjusted+1;
        IF v_delta>0 THEN v_added := v_added+v_delta; ELSE v_removed := v_removed+abs(v_delta); END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted',v_inserted,
    'updated',v_updated,
    'stock_adjusted',v_adjusted,
    'stock_units_added',v_added,
    'stock_units_removed',v_removed,
    'stock_synced',_sync_stock,
    'branch_id',_branch_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.import_catalogue_branch_stock(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_catalogue_branch_stock(uuid,uuid,jsonb,boolean) TO authenticated;

       OR CASE WHEN coalesce(btrim(e.value->>'opening_stock'),'') ~ '^[0-9]+(\\.[0-9]{1,3})?
  ) THEN
    RAISE EXCEPTION 'Every Google Sheets row must contain a valid non-negative Master Qty with at most 3 decimals';
  END IF;

  -- Serialize catalogue writes and stock reconciliation across concurrent imports.
  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,0));

  FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
    v_sku := btrim(r->>'sku');
    v_model := nullif(btrim(r->>'model_code'),'');
    v_variant_name := coalesce(nullif(btrim(r->>'variant_name'),''),'Standard');
    v_name := coalesce(nullif(btrim(r->>'product_name'),''),v_sku);
    v_category := coalesce(nullif(btrim(r->>'category'),''),'');
    v_target := coalesce((r->>'opening_stock')::numeric,0);

    SELECT coalesce(array_agg(DISTINCT btrim(x) ORDER BY btrim(x)),'{}'::text[])
      INTO v_sizes
      FROM regexp_split_to_table(coalesce(r->>'sizes',''),',') x
     WHERE btrim(x)<>'';

    SELECT pv.id,pv.product_id INTO v_variant_id,v_product_id
      FROM public.product_variants pv
     WHERE pv.business_id=_business_id AND lower(btrim(pv.sku))=lower(v_sku)
     FOR UPDATE;

    IF v_variant_id IS NULL THEN
      INSERT INTO public.products(business_id,name,category,catalogue_sizes)
      VALUES(_business_id,v_name,v_category,v_sizes)
      RETURNING id INTO v_product_id;
      INSERT INTO public.product_variants(
        business_id,product_id,name,sku,barcode,unit,selling_price,reorder_level,
        purchase_price,model_code,mrp,wholesale_price
      ) VALUES (
        _business_id,v_product_id,v_variant_name,v_sku,
        nullif(btrim(r->>'barcode'),''),coalesce(nullif(btrim(r->>'unit'),''),'pcs'),
        coalesce((r->>'selling_price')::numeric,0),coalesce((r->>'reorder_level')::numeric,0),
        CASE WHEN v_can_manage_cost THEN coalesce((r->>'purchase_price')::numeric,0) ELSE 0 END,
        v_model,coalesce((r->>'mrp')::numeric,0),coalesce((r->>'wholesale_price')::numeric,0)
      ) RETURNING id INTO v_variant_id;
      v_inserted := v_inserted+1;
    ELSE
      UPDATE public.products
         SET name=v_name,category=v_category,catalogue_sizes=v_sizes,updated_at=now()
       WHERE business_id=_business_id AND id=v_product_id;
      UPDATE public.product_variants
         SET name=v_variant_name,
             barcode=nullif(btrim(r->>'barcode'),''),
             unit=coalesce(nullif(btrim(r->>'unit'),''),'pcs'),
             selling_price=coalesce((r->>'selling_price')::numeric,0),
             purchase_price=CASE WHEN v_can_manage_cost THEN coalesce((r->>'purchase_price')::numeric,0) ELSE purchase_price END,
             model_code=v_model,
             mrp=coalesce((r->>'mrp')::numeric,0),
             wholesale_price=coalesce((r->>'wholesale_price')::numeric,0),
             reorder_level=coalesce((r->>'reorder_level')::numeric,0),
             updated_at=now()
       WHERE business_id=_business_id AND id=v_variant_id;
      v_updated := v_updated+1;
    END IF;

    IF _sync_stock THEN
      v_current := public.commerce_stock_balance(_business_id,_branch_id,v_variant_id);
      v_delta := v_target-v_current;
      IF v_delta<>0 THEN
        PERFORM public.post_stock_operation(
          _business_id,gen_random_uuid(),v_variant_id,_branch_id,NULL,'adjustment',v_delta,
          'Google Sheets master sync',
          format('Google Sheets Master Qty set branch quantity to %s (previous quantity %s)',v_target,v_current)
        );
        v_adjusted := v_adjusted+1;
        IF v_delta>0 THEN v_added := v_added+v_delta; ELSE v_removed := v_removed+abs(v_delta); END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted',v_inserted,
    'updated',v_updated,
    'stock_adjusted',v_adjusted,
    'stock_units_added',v_added,
    'stock_units_removed',v_removed,
    'stock_synced',_sync_stock,
    'branch_id',_branch_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.import_catalogue_branch_stock(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_catalogue_branch_stock(uuid,uuid,jsonb,boolean) TO authenticated;

          THEN (e.value->>'opening_stock')::numeric > 999999999
          ELSE false END
  ) THEN
    RAISE EXCEPTION 'Every Google Sheets row must contain a valid non-negative Master Qty with at most 3 decimals';
  END IF;

  -- Serialize catalogue writes and stock reconciliation across concurrent imports.
  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,0));

  FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
    v_sku := btrim(r->>'sku');
    v_model := nullif(btrim(r->>'model_code'),'');
    v_variant_name := coalesce(nullif(btrim(r->>'variant_name'),''),'Standard');
    v_name := coalesce(nullif(btrim(r->>'product_name'),''),v_sku);
    v_category := coalesce(nullif(btrim(r->>'category'),''),'');
    v_target := coalesce((r->>'opening_stock')::numeric,0);

    SELECT coalesce(array_agg(DISTINCT btrim(x) ORDER BY btrim(x)),'{}'::text[])
      INTO v_sizes
      FROM regexp_split_to_table(coalesce(r->>'sizes',''),',') x
     WHERE btrim(x)<>'';

    SELECT pv.id,pv.product_id INTO v_variant_id,v_product_id
      FROM public.product_variants pv
     WHERE pv.business_id=_business_id AND lower(btrim(pv.sku))=lower(v_sku)
     FOR UPDATE;

    IF v_variant_id IS NULL THEN
      INSERT INTO public.products(business_id,name,category,catalogue_sizes)
      VALUES(_business_id,v_name,v_category,v_sizes)
      RETURNING id INTO v_product_id;
      INSERT INTO public.product_variants(
        business_id,product_id,name,sku,barcode,unit,selling_price,reorder_level,
        purchase_price,model_code,mrp,wholesale_price
      ) VALUES (
        _business_id,v_product_id,v_variant_name,v_sku,
        nullif(btrim(r->>'barcode'),''),coalesce(nullif(btrim(r->>'unit'),''),'pcs'),
        coalesce((r->>'selling_price')::numeric,0),coalesce((r->>'reorder_level')::numeric,0),
        CASE WHEN v_can_manage_cost THEN coalesce((r->>'purchase_price')::numeric,0) ELSE 0 END,
        v_model,coalesce((r->>'mrp')::numeric,0),coalesce((r->>'wholesale_price')::numeric,0)
      ) RETURNING id INTO v_variant_id;
      v_inserted := v_inserted+1;
    ELSE
      UPDATE public.products
         SET name=v_name,category=v_category,catalogue_sizes=v_sizes,updated_at=now()
       WHERE business_id=_business_id AND id=v_product_id;
      UPDATE public.product_variants
         SET name=v_variant_name,
             barcode=nullif(btrim(r->>'barcode'),''),
             unit=coalesce(nullif(btrim(r->>'unit'),''),'pcs'),
             selling_price=coalesce((r->>'selling_price')::numeric,0),
             purchase_price=CASE WHEN v_can_manage_cost THEN coalesce((r->>'purchase_price')::numeric,0) ELSE purchase_price END,
             model_code=v_model,
             mrp=coalesce((r->>'mrp')::numeric,0),
             wholesale_price=coalesce((r->>'wholesale_price')::numeric,0),
             reorder_level=coalesce((r->>'reorder_level')::numeric,0),
             updated_at=now()
       WHERE business_id=_business_id AND id=v_variant_id;
      v_updated := v_updated+1;
    END IF;

    IF _sync_stock THEN
      v_current := public.commerce_stock_balance(_business_id,_branch_id,v_variant_id);
      v_delta := v_target-v_current;
      IF v_delta<>0 THEN
        PERFORM public.post_stock_operation(
          _business_id,gen_random_uuid(),v_variant_id,_branch_id,NULL,'adjustment',v_delta,
          'Google Sheets master sync',
          format('Google Sheets Master Qty set branch quantity to %s (previous quantity %s)',v_target,v_current)
        );
        v_adjusted := v_adjusted+1;
        IF v_delta>0 THEN v_added := v_added+v_delta; ELSE v_removed := v_removed+abs(v_delta); END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted',v_inserted,
    'updated',v_updated,
    'stock_adjusted',v_adjusted,
    'stock_units_added',v_added,
    'stock_units_removed',v_removed,
    'stock_synced',_sync_stock,
    'branch_id',_branch_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.import_catalogue_branch_stock(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_catalogue_branch_stock(uuid,uuid,jsonb,boolean) TO authenticated;
