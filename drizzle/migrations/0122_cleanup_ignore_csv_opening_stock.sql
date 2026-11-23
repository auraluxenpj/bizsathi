-- 0122: stock quantity alone does not make a SKU ineligible.
-- CSV-imported quantity-setting adjustments are opening balances, not trading transactions.
-- They are removed only when the user explicitly deletes the selected SKU.
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
        SELECT sm.quantity FROM public.stock_movements sm
         WHERE sm.business_id=_business_id AND sm.variant_id=v.variant_id
           AND NOT (sm.kind='adjustment' AND sm.reason LIKE 'CSV import set branch quantity to % (previous quantity 0)')
        UNION ALL
        SELECT csm.quantity FROM public.commerce_stock_movements csm WHERE csm.business_id=_business_id AND csm.variant_id=v.variant_id
        UNION ALL
        SELECT wim.quantity::numeric FROM public.website_inventory_movements wim WHERE wim.business_id=_business_id AND wim.variant_id=v.variant_id
      ) m;
    -- Nonzero balance is informational only; it is not a deletion blocker.
    IF EXISTS(SELECT 1 FROM public.stock_movements sm WHERE sm.business_id=_business_id AND sm.variant_id=v.variant_id
       AND NOT (sm.kind='adjustment' AND sm.reason LIKE 'CSV import set branch quantity to % (previous quantity 0)'))
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
    THEN why := array_append(why,'Sales, purchases, stock transactions, counts, returns, reservations or sync history exists'); END IF;

    SELECT EXISTS(
      SELECT 1 FROM public.commerce_documents d
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.lines)='array' THEN d.lines ELSE '[]'::jsonb END) line
      WHERE d.business_id=_business_id AND (
        line->>'variant_id'=v.variant_id::text OR line->>'variantId'=v.variant_id::text
        OR lower(btrim(coalesce(line->>'sku','')))=lower(btrim(v.sku))
      )
    ) INTO doc_refs;
    IF doc_refs THEN why := array_append(why,'Saved sales, purchase, quotation or other document references this SKU'); END IF;

    -- Ignore only the CSV opening-balance rows; all other FK references remain blocking.
    SELECT public._sku_cleanup_has_fk_reference('public.product_variants'::regclass,v.variant_id,_business_id,'public.stock_movements'::regclass)
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

CREATE OR REPLACE FUNCTION public.delete_unused_product_skus(_business_id uuid,_variant_ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v record; n integer:=0; eligible_count integer;
BEGIN
  IF NOT public.has_business_role(_business_id,'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF _variant_ids IS NULL OR cardinality(_variant_ids)=0 OR cardinality(_variant_ids)>1000 THEN RAISE EXCEPTION 'Select between 1 and 1000 eligible SKUs'; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(_variant_ids) x)<>cardinality(_variant_ids) THEN RAISE EXCEPTION 'Duplicate SKU selection is not allowed'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,0));
  SELECT count(*) INTO eligible_count FROM public.preview_unused_product_skus(_business_id) p WHERE p.variant_id=ANY(_variant_ids) AND p.eligible;
  IF eligible_count<>cardinality(_variant_ids) THEN RAISE EXCEPTION 'One or more selected SKUs now have linked transaction history. Refresh the preview and try again.'; END IF;
  FOR v IN
    SELECT pv.id AS variant_id,pv.product_id,pv.name AS variant_name,pv.sku,p.name AS product_name
      FROM public.product_variants pv JOIN public.products p ON p.business_id=pv.business_id AND p.id=pv.product_id
     WHERE pv.business_id=_business_id AND pv.id=ANY(_variant_ids)
     ORDER BY pv.id FOR UPDATE OF pv,p
  LOOP
    INSERT INTO public.product_cleanup_audit(business_id,actor_id,product_id,variant_id,product_name,variant_name,sku)
    VALUES(_business_id,auth.uid(),v.product_id,v.variant_id,v.product_name,v.variant_name,v.sku);
    -- Remove only imported opening-balance rows that belong to this SKU.
    DELETE FROM public.stock_movements sm
     WHERE sm.business_id=_business_id AND sm.variant_id=v.variant_id
       AND sm.kind='adjustment'
       AND sm.reason LIKE 'CSV import set branch quantity to % (previous quantity 0)';
    DELETE FROM public.product_variants WHERE business_id=_business_id AND id=v.variant_id;
    n:=n+1;
    IF NOT EXISTS(SELECT 1 FROM public.product_variants WHERE business_id=_business_id AND product_id=v.product_id) THEN
      DELETE FROM public.products WHERE business_id=_business_id AND id=v.product_id;
    END IF;
  END LOOP;
  RETURN n;
END $$;
