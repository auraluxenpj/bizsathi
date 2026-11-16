-- 0050: Persistent physical inventory count sessions and controlled review.
-- Additive only. Count approval never posts stock movements or changes on-hand quantities.

CREATE TABLE IF NOT EXISTS public.inventory_count_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  count_date date NOT NULL,
  counted_by text NOT NULL CHECK (char_length(btrim(counted_by)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT,
  CHECK ((status IN ('approved','rejected')) = (reviewed_at IS NOT NULL)),
  CHECK ((status IN ('approved','rejected')) = (reviewed_by IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS inventory_count_sessions_business_branch_date_idx
  ON public.inventory_count_sessions(business_id, branch_id, count_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.inventory_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.inventory_count_sessions(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  sku_snapshot text NOT NULL,
  product_name_snapshot text NOT NULL,
  variant_name_snapshot text NOT NULL,
  unit_snapshot text NOT NULL,
  system_quantity numeric(18,3) NOT NULL,
  physical_quantity numeric(18,3),
  cost_price numeric(18,2),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, variant_id),
  CHECK (physical_quantity IS NULL OR physical_quantity >= 0),
  CHECK (cost_price IS NULL OR cost_price >= 0),
  FOREIGN KEY (business_id, session_id) REFERENCES public.inventory_count_sessions(business_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS inventory_count_lines_session_idx ON public.inventory_count_lines(session_id);

ALTER TABLE public.inventory_count_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_count_sessions, public.inventory_count_lines FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.inventory_count_sessions, public.inventory_count_lines TO service_role;

CREATE OR REPLACE FUNCTION public.create_inventory_count_session(
  _business_id uuid, _branch_id uuid, _count_date date, _counted_by text, _lines jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _session_id uuid;
  _line jsonb;
  _variant_id uuid;
  _physical numeric;
  _cost numeric;
  _can_cost boolean;
  _variant record;
  _system numeric;
BEGIN
  IF _actor IS NULL OR NOT public.is_business_member(_business_id)
     OR NOT public.can_access_branch(_business_id, _branch_id) THEN
    RAISE EXCEPTION 'Branch inventory access is required' USING ERRCODE = '42501';
  END IF;
  IF _counted_by IS NULL OR char_length(btrim(_counted_by)) NOT BETWEEN 1 AND 120
     OR _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) > 10000 THEN
    RAISE EXCEPTION 'Invalid inventory count details' USING ERRCODE = '22023';
  END IF;
  _can_cost := public.has_permission(_business_id, 'other.purchase_price');
  INSERT INTO public.inventory_count_sessions(business_id, branch_id, count_date, counted_by, created_by)
  VALUES (_business_id, _branch_id, _count_date, btrim(_counted_by), _actor)
  RETURNING id INTO _session_id;

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
    SELECT pv.id, pv.sku, pv.name AS variant_name, pv.unit, p.name AS product_name
      INTO _variant
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id AND p.business_id = pv.business_id
     WHERE pv.id = _variant_id AND pv.business_id = _business_id AND pv.is_active AND p.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'A counted product is unavailable in this business' USING ERRCODE = '22023'; END IF;
    SELECT COALESCE(sum(qty),0) INTO _system FROM (
      SELECT sm.quantity AS qty FROM public.stock_movements sm
       WHERE sm.business_id = _business_id AND sm.branch_id = _branch_id AND sm.variant_id = _variant_id
      UNION ALL
      SELECT cm.quantity AS qty FROM public.commerce_stock_movements cm
       WHERE cm.business_id = _business_id AND cm.branch_id = _branch_id AND cm.variant_id = _variant_id
    ) ledger;
    INSERT INTO public.inventory_count_lines(
      session_id,business_id,variant_id,sku_snapshot,product_name_snapshot,variant_name_snapshot,unit_snapshot,
      system_quantity,physical_quantity,cost_price,note
    ) VALUES (
      _session_id,_business_id,_variant_id,_variant.sku,_variant.product_name,_variant.variant_name,_variant.unit,
      _system,_physical,_cost,NULLIF(left(coalesce(_line->>'note',''),500),'')
    );
  END LOOP;
  PERFORM public.write_audit(_business_id,'inventory_count_created','inventory_count_sessions',_session_id::text,NULL,
    jsonb_build_object('branch_id',_branch_id,'count_date',_count_date,'counted_by',btrim(_counted_by),'line_count',jsonb_array_length(_lines)));
  RETURN _session_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_inventory_count_session(
  _session_id uuid, _count_date date, _counted_by text, _lines jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.inventory_count_sessions%ROWTYPE; _new_id uuid;
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
  DELETE FROM public.inventory_count_lines WHERE session_id=_session_id;
  -- Reuse the same trusted creation logic, then move the newly built lines into the existing draft.
  _new_id := public.create_inventory_count_session(_s.business_id,_s.branch_id,_count_date,_counted_by,_lines);
  DELETE FROM public.inventory_count_lines WHERE session_id=_new_id;
  UPDATE public.inventory_count_lines SET session_id=_session_id WHERE session_id=_new_id;
  DELETE FROM public.inventory_count_sessions WHERE id=_new_id;
  UPDATE public.inventory_count_sessions SET count_date=_count_date,counted_by=btrim(_counted_by),updated_at=now() WHERE id=_session_id;
  PERFORM public.write_audit(_s.business_id,'inventory_count_updated','inventory_count_sessions',_session_id::text,NULL,
    jsonb_build_object('count_date',_count_date,'counted_by',btrim(_counted_by),'line_count',jsonb_array_length(_lines)));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.submit_inventory_count_session(_session_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.inventory_count_sessions%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.inventory_count_sessions WHERE id=_session_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.can_access_branch(_s.business_id,_s.branch_id)
     OR _s.status <> 'draft'
     OR NOT (_s.created_by=auth.uid() OR public.has_business_role(_s.business_id,'admin')) THEN
    RAISE EXCEPTION 'This draft cannot be submitted by this user' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventory_count_lines WHERE session_id=_session_id AND physical_quantity IS NOT NULL) THEN
    RAISE EXCEPTION 'Enter at least one physical quantity before submitting' USING ERRCODE = '22023';
  END IF;
  UPDATE public.inventory_count_sessions SET status='submitted',submitted_at=now(),updated_at=now() WHERE id=_session_id;
  PERFORM public.write_audit(_s.business_id,'inventory_count_submitted','inventory_count_sessions',_session_id::text,
    jsonb_build_object('status','draft'),jsonb_build_object('status','submitted'));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.review_inventory_count_session(_session_id uuid,_decision text,_note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.inventory_count_sessions%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.inventory_count_sessions WHERE id=_session_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.has_business_role(_s.business_id,'admin')
     OR NOT public.can_access_branch(_s.business_id,_s.branch_id) OR _s.status <> 'submitted'
     OR _s.created_by=auth.uid() OR _decision NOT IN ('approved','rejected')
     OR (_decision='rejected' AND char_length(btrim(coalesce(_note,'')))=0)
     OR char_length(coalesce(_note,'')) > 1000 THEN
    RAISE EXCEPTION 'Only a different business administrator may approve or reject a submitted count; rejection requires a note' USING ERRCODE = '42501';
  END IF;
  UPDATE public.inventory_count_sessions SET status=_decision,reviewed_by=auth.uid(),reviewed_at=now(),
    review_note=NULLIF(btrim(_note),''),updated_at=now() WHERE id=_session_id;
  PERFORM public.write_audit(_s.business_id,'inventory_count_'||_decision,'inventory_count_sessions',_session_id::text,
    jsonb_build_object('status','submitted'),jsonb_build_object('status',_decision,'review_note',NULLIF(btrim(_note),'')));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.list_inventory_count_sessions(_business_id uuid)
RETURNS TABLE(id uuid,branch_id uuid,branch_name text,count_date date,counted_by text,status text,
  created_by uuid,created_at timestamptz,submitted_at timestamptz,reviewed_by uuid,reviewed_at timestamptz,review_note text,
  line_count bigint,counted_line_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Business access is required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT s.id,s.branch_id,b.name,s.count_date,s.counted_by,s.status,s.created_by,s.created_at,
    s.submitted_at,s.reviewed_by,s.reviewed_at,s.review_note,count(l.id),
    count(l.id) FILTER (WHERE l.physical_quantity IS NOT NULL)
  FROM public.inventory_count_sessions s
  JOIN public.branches b ON b.id=s.branch_id AND b.business_id=s.business_id
  LEFT JOIN public.inventory_count_lines l ON l.session_id=s.id
  WHERE s.business_id=_business_id AND public.can_access_branch(s.business_id,s.branch_id)
  GROUP BY s.id,b.name ORDER BY s.count_date DESC,s.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.read_inventory_count_session(_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.inventory_count_sessions%ROWTYPE; _can_cost boolean; _result jsonb;
BEGIN
  SELECT * INTO _s FROM public.inventory_count_sessions WHERE id=_session_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.can_access_branch(_s.business_id,_s.branch_id) THEN
    RAISE EXCEPTION 'Inventory count is unavailable' USING ERRCODE = '42501';
  END IF;
  _can_cost := public.has_permission(_s.business_id,'other.purchase_price');
  SELECT jsonb_build_object(
    'session',to_jsonb(_s),
    'lines',coalesce(jsonb_agg(jsonb_build_object(
      'id',l.id,'variant_id',l.variant_id,'sku',l.sku_snapshot,'product',l.product_name_snapshot,
      'variant',l.variant_name_snapshot,'unit',l.unit_snapshot,'system_quantity',l.system_quantity,
      'physical_quantity',l.physical_quantity,'variance',CASE WHEN l.physical_quantity IS NULL THEN NULL ELSE l.physical_quantity-l.system_quantity END,
      'cost_price',CASE WHEN _can_cost THEN l.cost_price ELSE NULL END,
      'system_value',CASE WHEN _can_cost AND l.cost_price IS NOT NULL THEN l.system_quantity*l.cost_price ELSE NULL END,
      'physical_value',CASE WHEN _can_cost AND l.cost_price IS NOT NULL AND l.physical_quantity IS NOT NULL THEN l.physical_quantity*l.cost_price ELSE NULL END,
      'note',l.note
    ) ORDER BY l.product_name_snapshot,l.sku_snapshot),'[]'::jsonb)
  ) INTO _result FROM public.inventory_count_lines l WHERE l.session_id=_session_id;
  RETURN _result;
END $$;

REVOKE ALL ON FUNCTION public.create_inventory_count_session(uuid,uuid,date,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_inventory_count_session(uuid,date,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_inventory_count_session(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.review_inventory_count_session(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_inventory_count_sessions(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.read_inventory_count_session(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_count_session(uuid,uuid,date,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_inventory_count_session(uuid,date,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_inventory_count_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_inventory_count_session(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_inventory_count_sessions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_inventory_count_session(uuid) TO authenticated;
