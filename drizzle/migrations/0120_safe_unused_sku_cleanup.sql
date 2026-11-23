-- 0120: safely remove only unused catalogue SKUs from BizSathi.
-- No stock, document, inventory-count, reservation, return, or sync history is deleted.
CREATE OR REPLACE FUNCTION public._sku_cleanup_has_fk_reference(
  _parent regclass, _row_id uuid, _business_id uuid, _exclude_child regclass DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE fk record; join_sql text; found_reference boolean;
BEGIN
  FOR fk IN
    SELECT c.conrelid AS child_rel, child_ns.nspname AS child_schema, child_rel.relname AS child_name,
           parent_ns.nspname AS parent_schema, parent_rel.relname AS parent_name,
           c.conkey, c.confkey
      FROM pg_constraint c
      JOIN pg_class child_rel ON child_rel.oid=c.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid=child_rel.relnamespace
      JOIN pg_class parent_rel ON parent_rel.oid=c.confrelid
      JOIN pg_namespace parent_ns ON parent_ns.oid=parent_rel.relnamespace
     WHERE c.contype='f' AND c.confrelid=_parent
       AND c.conrelid IS DISTINCT FROM _exclude_child
  LOOP
    SELECT string_agg(format('c.%I = p.%I', ca.attname, pa.attname), ' AND ' ORDER BY pair.ord)
      INTO join_sql
      FROM unnest(fk.conkey, fk.confkey) WITH ORDINALITY AS pair(child_attnum,parent_attnum,ord)
      JOIN pg_attribute ca ON ca.attrelid=fk.child_rel AND ca.attnum=pair.child_attnum
      JOIN pg_attribute pa ON pa.attrelid=_parent AND pa.attnum=pair.parent_attnum;
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I.%I c JOIN %I.%I p ON %s WHERE p.id=$1 AND p.business_id=$2)',
      fk.child_schema, fk.child_name, fk.parent_schema, fk.parent_name, join_sql
    ) INTO found_reference USING _row_id, _business_id;
    IF found_reference THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public._sku_cleanup_has_fk_reference(regclass,uuid,uuid,regclass) FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.product_cleanup_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  product_name text NOT NULL,
  variant_name text NOT NULL,
  sku text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.product_cleanup_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.product_cleanup_audit TO authenticated;
GRANT ALL ON public.product_cleanup_audit TO service_role;
ALTER TABLE public.product_cleanup_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_cleanup_audit_read ON public.product_cleanup_audit;
CREATE POLICY product_cleanup_audit_read ON public.product_cleanup_audit
  FOR SELECT TO authenticated USING (public.has_business_role(business_id,'admin'));

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
        SELECT quantity FROM public.stock_movements WHERE business_id=_business_id AND variant_id=v.variant_id
        UNION ALL
        SELECT quantity FROM public.commerce_stock_movements WHERE business_id=_business_id AND variant_id=v.variant_id
        UNION ALL
        SELECT quantity::numeric FROM public.website_inventory_movements WHERE business_id=_business_id AND variant_id=v.variant_id
      ) m;
    IF qty <> 0 THEN why := array_append(why,'Current stock is not zero'); END IF;
    IF EXISTS(SELECT 1 FROM public.stock_movements WHERE business_id=_business_id AND variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.stock_operations WHERE business_id=_business_id AND variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.commerce_stock_movements WHERE business_id=_business_id AND variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.inventory_count_lines WHERE variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.inventory_count_adjustment_lines WHERE business_id=_business_id AND variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.website_inventory_movements WHERE business_id=_business_id AND variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.website_inventory_reservation_items WHERE business_id=_business_id AND variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.website_inventory_return_items WHERE business_id=_business_id AND variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.website_inventory_return_movements WHERE business_id=_business_id AND variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.website_stock_acknowledgements WHERE business_id=_business_id AND variant_id=v.variant_id)
       OR EXISTS(SELECT 1 FROM public.auraluxe_stock_outbox WHERE business_id=_business_id AND bizsathi_variant_id=v.variant_id)
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
REVOKE ALL ON FUNCTION public.preview_unused_product_skus(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_unused_product_skus(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_unused_product_skus(_business_id uuid,_variant_ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v record; n integer:=0; eligible_count integer;
BEGIN
  IF NOT public.has_business_role(_business_id,'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
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
    RAISE EXCEPTION 'One or more selected SKUs now have stock or linked history. Refresh the preview and try again.';
  END IF;
  FOR v IN
    SELECT pv.id AS variant_id,pv.product_id,pv.name AS variant_name,pv.sku,p.name AS product_name
      FROM public.product_variants pv
      JOIN public.products p ON p.business_id=pv.business_id AND p.id=pv.product_id
     WHERE pv.business_id=_business_id AND pv.id=ANY(_variant_ids)
     ORDER BY pv.id
     FOR UPDATE OF pv,p
  LOOP
    INSERT INTO public.product_cleanup_audit(business_id,actor_id,product_id,variant_id,product_name,variant_name,sku)
    VALUES(_business_id,auth.uid(),v.product_id,v.variant_id,v.product_name,v.variant_name,v.sku);
    DELETE FROM public.product_variants WHERE business_id=_business_id AND id=v.variant_id;
    n:=n+1;
    IF NOT EXISTS(SELECT 1 FROM public.product_variants WHERE business_id=_business_id AND product_id=v.product_id) THEN
      DELETE FROM public.products WHERE business_id=_business_id AND id=v.product_id;
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.delete_unused_product_skus(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_unused_product_skus(uuid,uuid[]) TO authenticated;
