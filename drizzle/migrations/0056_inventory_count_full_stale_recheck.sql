-- 0056: Recheck every physically counted item before stock adjustment.
-- Proposal rows remain limited to non-zero differences; stale validation covers
-- every line with an entered physical quantity, including exact matches.

CREATE OR REPLACE FUNCTION public.prepare_inventory_count_adjustment(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _s public.inventory_count_sessions%ROWTYPE;
  _existing public.inventory_count_adjustment_batches%ROWTYPE;
  _batch_id uuid;
  _line record;
  _current numeric;
  _stale boolean := false;
  _line_count integer := 0;
BEGIN
  SELECT * INTO _s
    FROM public.inventory_count_sessions
   WHERE id = _session_id
   FOR UPDATE;

  IF NOT FOUND OR auth.uid() IS NULL
     OR NOT public.has_business_role(_s.business_id, 'admin')
     OR NOT public.can_access_branch(_s.business_id, _s.branch_id)
     OR _s.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved count can be prepared by a business administrator'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_s.business_id::text, 0));

  SELECT * INTO _existing
    FROM public.inventory_count_adjustment_batches
   WHERE session_id = _session_id
     AND business_id = _s.business_id
   FOR UPDATE;

  IF FOUND THEN
    RETURN public.read_inventory_count_adjustment(_session_id);
  END IF;

  INSERT INTO public.inventory_count_adjustment_batches(
    business_id, session_id, branch_id, status, prepared_by
  ) VALUES (_s.business_id, _session_id, _s.branch_id, 'pending', auth.uid())
  RETURNING id INTO _batch_id;

  -- Staleness applies to ALL entered physical counts, not just differences.
  FOR _line IN
    SELECT l.variant_id, l.system_quantity
      FROM public.inventory_count_lines l
     WHERE l.session_id = _session_id
       AND l.physical_quantity IS NOT NULL
     ORDER BY l.variant_id
  LOOP
    _current := public.commerce_stock_balance(_s.business_id, _s.branch_id, _line.variant_id);
    IF _current IS DISTINCT FROM _line.system_quantity THEN
      _stale := true;
    END IF;
  END LOOP;

  -- Only shortages and surpluses become adjustment proposal rows.
  FOR _line IN
    SELECT l.variant_id, l.sku_snapshot, l.product_name_snapshot,
           l.system_quantity, l.physical_quantity
      FROM public.inventory_count_lines l
     WHERE l.session_id = _session_id
       AND l.physical_quantity IS NOT NULL
       AND l.physical_quantity <> l.system_quantity
     ORDER BY l.variant_id
  LOOP
    _current := public.commerce_stock_balance(_s.business_id, _s.branch_id, _line.variant_id);
    INSERT INTO public.inventory_count_adjustment_lines(
      business_id, batch_id, variant_id, sku_snapshot, product_name_snapshot,
      system_quantity, physical_quantity, delta, current_quantity_at_prepare
    ) VALUES (
      _s.business_id, _batch_id, _line.variant_id, _line.sku_snapshot, _line.product_name_snapshot,
      _line.system_quantity, _line.physical_quantity,
      _line.physical_quantity - _line.system_quantity, _current
    );
    _line_count := _line_count + 1;
  END LOOP;

  UPDATE public.inventory_count_adjustment_batches
     SET status = CASE WHEN _stale THEN 'stale'
                       WHEN _line_count = 0 THEN 'no_adjustments'
                       ELSE 'pending' END,
         stale_at = CASE WHEN _stale THEN now() ELSE NULL END
   WHERE id = _batch_id;

  PERFORM public.write_audit(
    _s.business_id,
    'inventory_count_adjustment_prepared',
    'inventory_count_adjustment_batches',
    _batch_id::text,
    NULL,
    jsonb_build_object(
      'session_id', _session_id,
      'line_count', _line_count,
      'status', CASE WHEN _stale THEN 'stale'
                     WHEN _line_count = 0 THEN 'no_adjustments'
                     ELSE 'pending' END
    )
  );

  RETURN public.read_inventory_count_adjustment(_session_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_inventory_count_adjustment(
  _session_id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _s public.inventory_count_sessions%ROWTYPE;
  _b public.inventory_count_adjustment_batches%ROWTYPE;
  _line record;
  _current numeric;
  _stale boolean := false;
  _operation_id uuid;
  _reference text;
BEGIN
  IF auth.uid() IS NULL OR _reason IS NULL
     OR char_length(btrim(_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'A confirmation reason of 1 to 500 characters is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _s
    FROM public.inventory_count_sessions
   WHERE id = _session_id
   FOR UPDATE;

  IF NOT FOUND
     OR NOT public.has_business_role(_s.business_id, 'admin')
     OR NOT public.can_access_branch(_s.business_id, _s.branch_id)
     OR _s.status <> 'approved' THEN
    RAISE EXCEPTION 'Administrator access to an approved count is required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_s.business_id::text, 0));

  SELECT * INTO _b
    FROM public.inventory_count_adjustment_batches
   WHERE session_id = _session_id
     AND business_id = _s.business_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prepare and review the proposed adjustments before confirming'
      USING ERRCODE = '22023';
  END IF;

  IF _b.status = 'posted' OR _b.status = 'no_adjustments' THEN
    RETURN public.read_inventory_count_adjustment(_session_id);
  END IF;

  IF _b.status = 'stale' THEN
    RAISE EXCEPTION 'Stock changed after the count. Start a fresh physical count before adjusting stock'
      USING ERRCODE = '40001';
  END IF;

  -- Recheck ALL physically counted variants, including those with zero delta.
  FOR _line IN
    SELECT l.variant_id, l.system_quantity
      FROM public.inventory_count_lines l
     WHERE l.session_id = _session_id
       AND l.physical_quantity IS NOT NULL
     ORDER BY l.variant_id
  LOOP
    _current := public.commerce_stock_balance(_s.business_id, _s.branch_id, _line.variant_id);
    IF _current IS DISTINCT FROM _line.system_quantity THEN
      _stale := true;
      EXIT;
    END IF;
  END LOOP;

  IF _stale THEN
    UPDATE public.inventory_count_adjustment_batches
       SET status = 'stale', stale_at = now()
     WHERE id = _b.id;

    PERFORM public.write_audit(
      _s.business_id,
      'inventory_count_adjustment_stale',
      'inventory_count_adjustment_batches',
      _b.id::text,
      jsonb_build_object('status', 'pending'),
      jsonb_build_object('status', 'stale', 'reason', 'Stock changed after the physical count')
    );

    RETURN public.read_inventory_count_adjustment(_session_id);
  END IF;

  _reference := 'Inventory count ' || left(_session_id::text, 8);

  FOR _line IN
    SELECT l.id, l.variant_id, l.delta
      FROM public.inventory_count_adjustment_lines l
     WHERE l.batch_id = _b.id
     ORDER BY l.variant_id
  LOOP
    _operation_id := gen_random_uuid();

    PERFORM public.post_stock_operation(
      _s.business_id,
      _operation_id,
      _line.variant_id,
      _s.branch_id,
      NULL,
      'adjustment',
      _line.delta,
      _reference,
      btrim(_reason)
    );

    UPDATE public.inventory_count_adjustment_lines
       SET stock_operation_id = _operation_id
     WHERE id = _line.id;
  END LOOP;

  UPDATE public.inventory_count_adjustment_batches
     SET status = 'posted',
         confirmed_by = auth.uid(),
         confirmed_at = now(),
         confirmation_reason = btrim(_reason)
   WHERE id = _b.id;

  PERFORM public.write_audit(
    _s.business_id,
    'inventory_count_adjustment_posted',
    'inventory_count_adjustment_batches',
    _b.id::text,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object(
      'status', 'posted',
      'session_id', _session_id,
      'line_count', (
        SELECT count(*)
          FROM public.inventory_count_adjustment_lines
         WHERE batch_id = _b.id
      ),
      'confirmation_reason', btrim(_reason)
    )
  );

  RETURN public.read_inventory_count_adjustment(_session_id);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_inventory_count_adjustment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_inventory_count_adjustment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_inventory_count_adjustment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_count_adjustment(uuid, text) TO authenticated;
