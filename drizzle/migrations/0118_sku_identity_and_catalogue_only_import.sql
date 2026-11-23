-- 0118: SKU is the catalogue identity; product names are descriptive and may repeat.
-- Catalogue imports never mutate stock. Stock is established through reviewed inventory counts.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_business_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_business_id_sku_normalized_key ON public.product_variants(business_id,lower(btrim(sku)));

CREATE OR REPLACE FUNCTION public.save_catalogue_variant(_business_id uuid, _rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; v_sku text; v_name text; v_category text; v_variant_name text; v_product_id uuid; v_variant_id uuid; v_sizes text[]; v_can_manage_cost boolean:=false; n integer:=0;
BEGIN
 IF NOT public.has_business_role(_business_id,'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 v_can_manage_cost:=public.has_permission(_business_id,'other.purchase_price');
 IF jsonb_typeof(_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(_rows) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Expected 1 to 5000 rows'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_rows) e WHERE nullif(btrim(e.value->>'sku'),'') IS NULL OR length(btrim(e.value->>'sku'))>80)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(_rows) e GROUP BY lower(btrim(e.value->>'sku')) HAVING count(*)>1) THEN RAISE EXCEPTION 'SKU is required and must appear once per import'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,0));
 FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
  v_sku:=btrim(r->>'sku');v_name:=coalesce(nullif(btrim(r->>'product_name'),''),v_sku);v_category:=coalesce(nullif(btrim(r->>'category'),''),'');v_variant_name:=coalesce(nullif(btrim(r->>'variant_name'),''),'Standard');
  SELECT coalesce(array_agg(DISTINCT btrim(x) ORDER BY btrim(x)),'{}'::text[]) INTO v_sizes FROM regexp_split_to_table(coalesce(r->>'sizes',''),',') x WHERE btrim(x)<>'';
  SELECT pv.id,pv.product_id INTO v_variant_id,v_product_id FROM public.product_variants pv WHERE pv.business_id=_business_id AND lower(btrim(pv.sku))=lower(v_sku) FOR UPDATE;
  IF v_variant_id IS NULL THEN
   INSERT INTO public.products(business_id,name,category,catalogue_sizes) VALUES(_business_id,v_name,v_category,v_sizes) RETURNING id INTO v_product_id;
   INSERT INTO public.product_variants(business_id,product_id,name,sku,barcode,unit,selling_price,reorder_level,purchase_price,model_code,mrp,wholesale_price)
   VALUES(_business_id,v_product_id,v_variant_name,v_sku,nullif(btrim(r->>'barcode'),''),coalesce(nullif(btrim(r->>'unit'),''),'pcs'),coalesce((r->>'selling_price')::numeric,0),coalesce((r->>'reorder_level')::numeric,0),CASE WHEN v_can_manage_cost THEN coalesce((r->>'purchase_price')::numeric,0) ELSE 0 END,nullif(btrim(r->>'model_code'),''),coalesce((r->>'mrp')::numeric,0),coalesce((r->>'wholesale_price')::numeric,0));
  ELSE
   UPDATE public.products SET name=v_name,category=v_category,catalogue_sizes=v_sizes,updated_at=now() WHERE business_id=_business_id AND id=v_product_id;
   UPDATE public.product_variants SET name=v_variant_name,barcode=nullif(btrim(r->>'barcode'),''),unit=coalesce(nullif(btrim(r->>'unit'),''),'pcs'),selling_price=coalesce((r->>'selling_price')::numeric,0),reorder_level=coalesce((r->>'reorder_level')::numeric,0),purchase_price=CASE WHEN v_can_manage_cost THEN coalesce((r->>'purchase_price')::numeric,0) ELSE purchase_price END,model_code=nullif(btrim(r->>'model_code'),''),mrp=coalesce((r->>'mrp')::numeric,0),wholesale_price=coalesce((r->>'wholesale_price')::numeric,0),updated_at=now() WHERE business_id=_business_id AND id=v_variant_id;
  END IF;n:=n+1;
 END LOOP;RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.import_catalogue_branch_stock(_business_id uuid,_branch_id uuid,_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;v_product_id uuid;v_variant_id uuid;v_sku text;v_model text;v_variant_name text;v_name text;v_category text;v_sizes text[];v_inserted integer:=0;v_updated integer:=0;v_can_manage_cost boolean:=false;
BEGIN
 IF NOT public.has_business_role(_business_id,'admin') THEN RAISE EXCEPTION 'Administrator access required';END IF;
 IF NOT public.has_permission(_business_id,'features.import') THEN RAISE EXCEPTION 'CSV import permission required';END IF;
 v_can_manage_cost:=public.has_permission(_business_id,'other.purchase_price');
 IF NOT public.can_access_branch(_business_id,_branch_id) OR NOT EXISTS(SELECT 1 FROM public.branches WHERE business_id=_business_id AND id=_branch_id AND is_active) THEN RAISE EXCEPTION 'You do not have access to the selected active branch';END IF;
 IF jsonb_typeof(_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(_rows) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Expected 1 to 5000 rows';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_rows) e WHERE nullif(btrim(e.value->>'sku'),'') IS NULL OR length(btrim(e.value->>'sku'))>80)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(_rows) e GROUP BY lower(btrim(e.value->>'sku')) HAVING count(*)>1) THEN RAISE EXCEPTION 'SKU is required and must appear once per import';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,0));
 FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
  v_sku:=btrim(r->>'sku');v_model:=nullif(btrim(r->>'model_code'),'');v_variant_name:=coalesce(nullif(btrim(r->>'variant_name'),''),'Standard');v_name:=coalesce(nullif(btrim(r->>'product_name'),''),v_sku);v_category:=coalesce(nullif(btrim(r->>'category'),''),'');
  SELECT coalesce(array_agg(DISTINCT btrim(x) ORDER BY btrim(x)),'{}'::text[]) INTO v_sizes FROM regexp_split_to_table(coalesce(r->>'sizes',''),',') x WHERE btrim(x)<>'';
  SELECT pv.id,pv.product_id INTO v_variant_id,v_product_id FROM public.product_variants pv WHERE pv.business_id=_business_id AND lower(btrim(pv.sku))=lower(v_sku) FOR UPDATE;
  IF v_variant_id IS NULL THEN
   INSERT INTO public.products(business_id,name,category,catalogue_sizes) VALUES(_business_id,v_name,v_category,v_sizes) RETURNING id INTO v_product_id;
   INSERT INTO public.product_variants(business_id,product_id,name,sku,barcode,unit,selling_price,reorder_level,purchase_price,model_code,mrp,wholesale_price)
   VALUES(_business_id,v_product_id,v_variant_name,v_sku,nullif(btrim(r->>'barcode'),''),coalesce(nullif(btrim(r->>'unit'),''),'pcs'),coalesce((r->>'selling_price')::numeric,0),coalesce((r->>'reorder_level')::numeric,0),CASE WHEN v_can_manage_cost THEN coalesce((r->>'purchase_price')::numeric,0) ELSE 0 END,v_model,coalesce((r->>'mrp')::numeric,0),coalesce((r->>'wholesale_price')::numeric,0));v_inserted:=v_inserted+1;
  ELSE
   UPDATE public.products SET name=v_name,category=v_category,catalogue_sizes=v_sizes,updated_at=now() WHERE business_id=_business_id AND id=v_product_id;
   UPDATE public.product_variants SET product_id=v_product_id,name=v_variant_name,model_code=v_model,barcode=nullif(btrim(r->>'barcode'),''),unit=coalesce(nullif(btrim(r->>'unit'),''),'pcs'),selling_price=coalesce((r->>'selling_price')::numeric,0),purchase_price=CASE WHEN v_can_manage_cost THEN coalesce((r->>'purchase_price')::numeric,0) ELSE purchase_price END,mrp=coalesce((r->>'mrp')::numeric,0),wholesale_price=coalesce((r->>'wholesale_price')::numeric,0),reorder_level=coalesce((r->>'reorder_level')::numeric,0),updated_at=now() WHERE business_id=_business_id AND id=v_variant_id;v_updated:=v_updated+1;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('inserted',v_inserted,'updated',v_updated,'stock_adjusted',0,'branch_id',_branch_id,'catalogue_only',true,'stock_note','Stock quantities were not changed. Use the reviewed inventory-count workflow to establish physical stock.');
END $$;
REVOKE ALL ON FUNCTION public.save_catalogue_variant(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_catalogue_variant(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.import_catalogue_branch_stock(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_catalogue_branch_stock(uuid,uuid,jsonb) TO authenticated;
