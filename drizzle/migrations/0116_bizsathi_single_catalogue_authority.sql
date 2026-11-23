-- 0116: BizSathi is the sole catalogue and stock authority for Auraluxe.
-- Auraluxe-origin catalogue writes are rejected. Existing rows and event history remain intact.
CREATE OR REPLACE FUNCTION public.upsert_shared_catalogue_from_auraluxe(_business_id uuid,_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RAISE EXCEPTION 'BizSathi is the sole catalogue authority; Auraluxe catalogue writes are not accepted';
END $$;
REVOKE ALL ON FUNCTION public.upsert_shared_catalogue_from_auraluxe(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_shared_catalogue_from_auraluxe(uuid,jsonb) TO service_role;

-- One-time complete snapshot used for initial Auraluxe reconciliation.
-- It is deliberately separate from incremental outbox delivery.
CREATE OR REPLACE FUNCTION public.get_auraluxe_catalogue_snapshot(_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; row_count integer; distinct_count integer;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role'
     OR _business_id<>'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid THEN
    RAISE EXCEPTION 'BizSathi service authorization required';
  END IF;
  -- Snapshot publication is a separate, explicit cutover operation. It may run
  -- while the incremental outbox remains disabled.
  SELECT count(*),count(DISTINCT lower(btrim(v.sku)))
    INTO row_count,distinct_count
    FROM public.products p
    JOIN public.product_variants v ON v.business_id=p.business_id AND v.product_id=p.id
   WHERE p.business_id=_business_id;
  IF row_count=0 OR row_count<>distinct_count
     OR EXISTS (
       SELECT 1 FROM public.products p
       JOIN public.product_variants v ON v.business_id=p.business_id AND v.product_id=p.id
       WHERE p.business_id=_business_id AND nullif(btrim(v.sku),'') IS NULL
     ) THEN
    RAISE EXCEPTION 'BizSathi catalogue snapshot is empty or contains missing/duplicate SKUs';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'product_id',p.id,'variant_id',v.id,'name',p.name,'category',p.category,
    'variant_name',v.name,'model_code',v.model_code,'sku',v.sku,'unit',v.unit,
    'sizes',to_jsonb(coalesce(p.catalogue_sizes,'{}'::text[])),
    'purchase_price',v.purchase_price,'mrp',v.mrp,'selling_price',v.selling_price,
    'wholesale_price',v.wholesale_price,'reorder_level',v.reorder_level,
    'published',(p.website_published AND p.is_active AND v.is_active),'notes',coalesce(v.catalogue_notes,p.catalogue_notes),
    'barcode',v.barcode
  ) ORDER BY lower(btrim(v.sku))) INTO result
    FROM public.products p
    JOIN public.product_variants v ON v.business_id=p.business_id AND v.product_id=p.id
   WHERE p.business_id=_business_id;
  RETURN coalesce(result,'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.get_auraluxe_catalogue_snapshot(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_auraluxe_catalogue_snapshot(uuid) TO service_role;

COMMENT ON FUNCTION public.get_auraluxe_catalogue_snapshot(uuid) IS 'Complete SKU-unique BizSathi snapshot for explicit Auraluxe storefront reconciliation; never used for incremental stock updates.';
