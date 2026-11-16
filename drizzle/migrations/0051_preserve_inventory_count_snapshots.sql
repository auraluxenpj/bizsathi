-- 0051: Preserve the original ledger snapshot when a saved draft is edited.
CREATE OR REPLACE FUNCTION public.update_inventory_count_session(
  _session_id uuid, _count_date date, _counted_by text, _lines jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.inventory_count_sessions%ROWTYPE;
  _line jsonb;
  _variant_id uuid;
  _physical numeric;
  _cost numeric;
  _can_cost boolean;
  _variant record;
  _system numeric;
  _has_snapshot boolean;
BEGIN
  SELECT * INTO _s FROM public.inventory_count_sessions WHERE id=_session_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.can_access_branch(_s.business_id,_s.branch_id)
     OR _s.status <> 'draft'
     OR NOT (_s.created_by=auth.uid() OR public.has_business_role(_s.business_id,'admin')) THEN
    RAISE EXCEPTION 'Only the draft creator or a business administrator may edit this count' USING ERRCODE = '42501';
  END IF;
  IF _counted_by IS NULL OR char_length(btrim(_counted_by)) NOT BETWEEN 1 AND 120
     OR _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) > 10000 THEN
    RAISE EXCEPTION 'Invalid inventory count details' USING ERRCODE = '22023';
  END IF;
  _can_cost := public.has_permission(_s.business_id,'other.purchase_price');
  FOR _line IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    _variant_id := (_line->>'variant_id')::uuid;
    _physical := NULLIF(_line->>'physical_quantity','')::numeric;
    _cost := CASE WHEN _can_cost THEN NULLIF(_line->>'cost_price','')::numeric ELSE NULL END;
    IF (_line ? 'physical_quantity') AND _line->>'physical_quantity' IS NOT NULL
       AND (_physical IS NULL OR _physical < 0 OR _physical > 999999999 OR scale(_physical) > 3) THEN
      RAISE EXCEPTION 'Invalid physical quantity' USING ERRCODE = '22023';
    END IF;
    IF _cost IS NOT NULL AND (_cost < 0 OR _cost > 999999999 OR scale(_cost) > 2) THEN
      RAISE EXCEPTION 'Invalid unit cost' USING ERRCODE = '22023';
    END IF;
    SELECT pv.id,pv.sku,pv.name AS variant_name,pv.unit,p.name AS product_name
      INTO _variant FROM public.product_variants pv
      JOIN public.products p ON p.id=pv.product_id AND p.business_id=pv.business_id
     WHERE pv.id=_variant_id AND pv.business_id=_s.business_id AND pv.is_active AND p.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'A counted product is unavailable in this business' USING ERRCODE = '22023'; END IF;
    SELECT l.system_quantity INTO _system FROM public.inventory_count_lines l
     WHERE l.session_id=_session_id AND l.variant_id=_variant_id;
    _has_snapshot := FOUND;
    IF NOT _has_snapshot THEN
      SELECT COALESCE(sum(qty),0) INTO _system FROM (
        SELECT sm.quantity AS qty FROM public.stock_movements sm
         WHERE sm.business_id=_s.business_id AND sm.branch_id=_s.branch_id AND sm.variant_id=_variant_id
        UNION ALL
        SELECT cm.quantity AS qty FROM public.commerce_stock_movements cm
         WHERE cm.business_id=_s.business_id AND cm.branch_id=_s.branch_id AND cm.variant_id=_variant_id
      ) ledger;
    END IF;
    INSERT INTO public.inventory_count_lines(
      session_id,business_id,variant_id,sku_snapshot,product_name_snapshot,variant_name_snapshot,unit_snapshot,
      system_quantity,physical_quantity,cost_price,note
    ) VALUES (
      _session_id,_s.business_id,_variant_id,_variant.sku,_variant.product_name,_variant.variant_name,_variant.unit,
      _system,_physical,_cost,NULLIF(left(coalesce(_line->>'note',''),500),'')
    )
    ON CONFLICT (session_id,variant_id) DO UPDATE SET
      physical_quantity=EXCLUDED.physical_quantity,
      cost_price=EXCLUDED.cost_price,
      note=EXCLUDED.note;
  END LOOP;
  DELETE FROM public.inventory_count_lines l
   WHERE l.session_id=_session_id
     AND NOT (l.variant_id IN (SELECT (value->>'variant_id')::uuid FROM jsonb_array_elements(_lines)));
  UPDATE public.inventory_count_sessions SET count_date=_count_date,counted_by=btrim(_counted_by),updated_at=now() WHERE id=_session_id;
  PERFORM public.write_audit(_s.business_id,'inventory_count_updated','inventory_count_sessions',_session_id::text,NULL,
    jsonb_build_object('count_date',_count_date,'counted_by',btrim(_counted_by),'line_count',jsonb_array_length(_lines)));
  RETURN true;
END $$;
