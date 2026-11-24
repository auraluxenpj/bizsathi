-- 0123: archive SKUs with non-sales inventory history; block only confirmed sales and sales returns.
-- Preserve every linked stock, purchase, count, reservation, return, and sync record.
CREATE OR REPLACE FUNCTION public.preview_unused_product_skus(_business_id uuid)
RETURNS TABLE(
  variant_id uuid, product_id uuid, product_name text, variant_name text, sku text,
  stock_quantity numeric, eligible boolean, reasons text[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v record; why text[]; qty numeric; sales_refs boolean;
BEGIN
  IF NOT public.has_business_role(_business_id,'admin') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  FOR v IN
    SELECT pv.id AS variant_id,pv.product_id,p.name AS product_name,pv.name AS variant_name,pv.sku
      FROM public.product_variants pv
      JOIN public.products p ON p.business_id=pv.business_id AND p.id=pv.product_id
     WHERE pv.business_id=_business_id AND pv.is_active=true
     ORDER BY p.name,pv.sku
  LOOP
    why := ARRAY[]::text[];

    SELECT coalesce(sum(m.quantity),0) INTO qty
      FROM (
        SELECT sm.quantity FROM public.stock_movements sm
         WHERE sm.business_id=_business_id AND sm.variant_id=v.variant_id
        UNION ALL
        SELECT csm.quantity FROM public.commerce_stock_movements csm
         WHERE csm.business_id=_business_id AND csm.variant_id=v.variant_id
        UNION ALL
        SELECT wim.quantity::numeric FROM public.website_inventory_movements wim
         WHERE wim.business_id=_business_id AND wim.variant_id=v.variant_id
      ) m;

    -- A confirmed sale or sales return is the only transaction-history blocker.
    SELECT EXISTS(
      SELECT 1
        FROM public.commerce_documents d
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(d.lines)='array' THEN d.lines ELSE '[]'::jsonb END
        ) line
       WHERE d.business_id=_business_id
         AND d.status='confirmed'
         AND d.kind IN ('sale','sale_return')
         AND (
           line->>'variant_id'=v.variant_id::text
           OR line->>'variantId'=v.variant_id::text
           OR lower(btrim(coalesce(line->>'sku','')))=lower(btrim(v.sku))
         )
    ) OR EXISTS(
      SELECT 1 FROM public.website_inventory_movements wim
       WHERE wim.business_id=_business_id AND wim.variant_id=v.variant_id
    ) OR EXISTS(
      SELECT 1 FROM public.website_inventory_return_movements wirm
       WHERE wirm.business_id=_business_id AND wirm.variant_id=v.variant_id
    ) INTO sales_refs;

    IF sales_refs THEN
      why := array_append(why,'A confirmed sale or sales return references this SKU');
    END IF;

    variant_id:=v.variant_id;
    product_id:=v.product_id;
    product_name:=v.product_name;
    variant_name:=v.variant_name;
    sku:=v.sku;
    stock_quantity:=qty;
    reasons:=why;
    eligible:=cardinality(why)=0;
    RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.preview_unused_product_skus(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_unused_product_skus(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_unused_product_skus(_business_id uuid,_variant_ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE eligible_count integer; archived_count integer;
BEGIN
  IF NOT public.has_business_role(_business_id,'admin') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF _variant_ids IS NULL OR cardinality(_variant_ids)=0 OR cardinality(_variant_ids)>1000 THEN
    RAISE EXCEPTION 'Select between 1 and 1000 eligible SKUs';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(_variant_ids) x)<>cardinality(_variant_ids) THEN
    RAISE EXCEPTION 'Duplicate SKU selection is not allowed';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,0));

  SELECT count(*) INTO eligible_count
    FROM public.preview_unused_product_skus(_business_id) p
   WHERE p.variant_id=ANY(_variant_ids) AND p.eligible;
  IF eligible_count<>cardinality(_variant_ids) THEN
    RAISE EXCEPTION 'One or more selected SKUs now have a confirmed sale or sales return. Refresh the preview and try again.';
  END IF;

  -- Archive instead of physically deleting: FK-linked inventory and sync ledgers remain intact.
  UPDATE public.product_variants
     SET is_active=false,updated_at=now()
   WHERE business_id=_business_id AND id=ANY(_variant_ids) AND is_active=true;
  GET DIAGNOSTICS archived_count=ROW_COUNT;

  -- Hide the parent product only when it has no remaining active variants.
  UPDATE public.products p
     SET is_active=false,updated_at=now()
   WHERE p.business_id=_business_id
     AND EXISTS (
       SELECT 1 FROM public.product_variants pv
        WHERE pv.business_id=p.business_id AND pv.product_id=p.id
          AND pv.id=ANY(_variant_ids)
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.product_variants pv
        WHERE pv.business_id=p.business_id AND pv.product_id=p.id AND pv.is_active=true
     );

  RETURN archived_count;
END $$;
REVOKE ALL ON FUNCTION public.delete_unused_product_skus(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_unused_product_skus(uuid,uuid[]) TO authenticated;
