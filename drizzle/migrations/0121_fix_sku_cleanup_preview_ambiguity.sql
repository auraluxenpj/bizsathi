-- Fix 0120 preview: qualify every variant_id reference because variant_id is also a RETURNS TABLE output variable.
CREATE OR REPLACE FUNCTION public.preview_unused_product_skus(_business_id uuid)
RETURNS TABLE(
  variant_id uuid, product_id uuid, product_name text, variant_name text, sku text,
  stock_quantity numeric, eligible boolean, reasons text[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v record; why text[]; qty numeric; doc_refs boolean; fk_ref boolean; product_fk_ref boolean;
BEGIN
  IF NOT public.has_business_role(_business_id,'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  FOR v IN
    SELECT pv.id AS variant_id,pv.product_id,p.name AS product_name,pv.name AS variant_name,pv.sku
      FROM public.product_variants pv
      JOIN public.products p ON p.business_id=pv.business_id AND p.id=pv.product_id
     WHERE pv.business_id=_business_id
     ORDER BY p.name,pv.sku
  LOOP
    why := ARRAY[]::text[];
    SELECT coalesce(sum(m.quantity),0) INTO qty
      FROM (
        SELECT sm.quantity FROM public.stock_movements sm WHERE sm.business_id=_business_id AND sm.variant_id=v.variant_id
        UNION ALL
        SELECT csm.quantity FROM public.commerce_stock_movements csm WHERE csm.business_id=_business_id AND csm.variant_id=v.variant_id
        UNION ALL
        SELECT wim.quantity::numeric FROM public.website_inventory_movements wim WHERE wim.business_id=_business_id AND wim.variant_id=v.variant_id
      ) m;
    IF qty <> 0 THEN why := array_append(why,'Current stock is not zero'); END IF;
    IF EXISTS(SELECT 1 FROM public.stock_movements sm WHERE sm.business_id=_business_id AND sm.variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.stock_operations so WHERE so.business_id=_business_id AND so.variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.commerce_stock_movements csm WHERE csm.business_id=_business_id AND csm.variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.inventory_count_lines icl WHERE icl.variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.inventory_count_adjustment_lines ical WHERE ical.business_id=_business_id AND ical.variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.website_inventory_movements wim WHERE wim.business_id=_business_id AND wim.variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.website_inventory_reservation_items wiri WHERE wiri.business_id=_business_id AND wiri.variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.website_inventory_return_items wiri WHERE wiri.business_id=_business_id AND wiri.variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.website_inventory_return_movements wirm WHERE wirm.business_id=_business_id AND wirm.variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.website_stock_acknowledgements wsa WHERE wsa.business_id=_business_id AND wsa.variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.auraluxe_stock_outbox aso WHERE aso.business_id=_business_id AND aso.bizsathi_variant_id=v.variant_id)
    THEN why := array_append(why,'Stock, count, return, reservation or sync history exists'); END IF;

    SELECT EXISTS(
      SELECT 1 FROM public.commerce_documents d
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(d.lines)='array' THEN d.lines ELSE '[]'::jsonb END
      ) line
      WHERE d.business_id=_business_id
        AND (
          line->>'variant_id'=v.variant_id::text OR line->>'variantId'=v.variant_id::text
          OR lower(btrim(coalesce(line->>'sku','')))=lower(btrim(v.sku))
        )
    ) INTO doc_refs;
    IF doc_refs THEN why := array_append(why,'Saved sales, purchase, quotation or other document references this SKU'); END IF;

    SELECT public._sku_cleanup_has_fk_reference('public.product_variants'::regclass,v.variant_id,_business_id,NULL)
      INTO fk_ref;
    IF fk_ref THEN why := array_append(why,'A linked record references this SKU'); END IF;

    IF (SELECT count(*) FROM public.product_variants sibling WHERE sibling.business_id=_business_id AND sibling.product_id=v.product_id)=1 THEN
      SELECT public._sku_cleanup_has_fk_reference('public.products'::regclass,v.product_id,_business_id,'public.product_variants'::regclass)
        INTO product_fk_ref;
      IF product_fk_ref THEN why := array_append(why,'A linked record references the parent product'); END IF;
    END IF;

    variant_id:=v.variant_id; product_id:=v.product_id; product_name:=v.product_name;
    variant_name:=v.variant_name; sku:=v.sku; stock_quantity:=qty;
    reasons:=why; eligible:=cardinality(why)=0;
    RETURN NEXT;
  END LOOP;
END $$;
