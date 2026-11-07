-- 0016: Stronger guard for stock pushes from BizSathi. Roll-forward replacement of one function from 0015; no table changes.
-- A push now also requires that the website stock still equals the value recorded when its sales were last
-- acknowledged (inventory_sync_state.last_stock). A caller that read the stock a moment too late, after a customer's
-- order had already been placed, can therefore no longer overwrite that order.
CREATE OR REPLACE FUNCTION public.inv_sync_push(_items jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it jsonb; s text; k text; want integer; exp integer; f record; agreed integer; out jsonb := '[]'::jsonb; res text;
BEGIN
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) > 2000 THEN RAISE EXCEPTION 'Invalid items'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    s := it->>'sku'; k := lower(btrim(s)); want := (it->>'stock')::integer; exp := (it->>'expected')::integer;
    IF want IS NULL OR want < 0 OR exp IS NULL THEN RAISE EXCEPTION 'Invalid stock for %', s; END IF;
    SELECT * INTO f FROM public.inv_sync_find(s, true);
    SELECT last_stock INTO agreed FROM public.inventory_sync_state WHERE sku = k FOR UPDATE;
    IF f.kind NOT IN ('variant','product') THEN res := 'no-match';
    ELSIF EXISTS (SELECT 1 FROM public.inventory_sync_acks a WHERE a.sku = k AND a.status = 'pending') THEN res := 'pending';
    ELSIF f.stock <> exp OR agreed IS NULL OR f.stock <> agreed THEN res := 'changed';
    ELSE
      IF f.kind = 'variant' THEN
        UPDATE public.product_variants SET stock = want WHERE id = f.variant_id;
        UPDATE public.products SET stock = greatest(0, stock + (want - f.stock)), updated_at = now() WHERE id = f.product_id;
      ELSE
        UPDATE public.products SET stock = want, updated_at = now() WHERE id = f.product_id;
      END IF;
      INSERT INTO public.inventory_sync_state(sku, last_stock) VALUES(k, want)
        ON CONFLICT (sku) DO UPDATE SET last_stock = excluded.last_stock, updated_at = now();
      INSERT INTO public.inventory_sync_log(sku, before_stock, after_stock) VALUES(k, f.stock, want);
      res := 'applied';
    END IF;
    out := out || jsonb_build_array(jsonb_build_object('sku', s, 'result', res, 'before', f.stock, 'after', CASE WHEN res = 'applied' THEN want ELSE f.stock END));
  END LOOP;
  RETURN out;
END $$;
REVOKE EXECUTE ON FUNCTION public.inv_sync_push(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inv_sync_push(jsonb) TO service_role;
