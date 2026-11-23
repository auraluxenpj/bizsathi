-- 0119: allow snapshot reconciliation to persist cross-system IDs while
-- incremental catalogue publishing remains disabled.
-- This RPC only writes Auraluxe identity references; it never changes catalogue
-- values, stock, publication state, or the outbox.
CREATE OR REPLACE FUNCTION public.upsert_auraluxe_catalogue_mappings(_business_id uuid, _items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  item jsonb;
  v_sku text;
  bp uuid;
  bv uuid;
  ap uuid;
  av uuid;
  product_id uuid;
  variant_id uuid;
  n integer := 0;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role'
     OR _business_id <> 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid THEN
    RAISE EXCEPTION 'Service authorization for Auraluxe mappings required';
  END IF;
  IF jsonb_typeof(_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Expected 1 to 100 Auraluxe SKU mappings';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) x
     WHERE nullif(btrim(x->>'sku'),'') IS NULL
        OR nullif(x->>'auraluxe_product_id','') IS NULL
        OR nullif(x->>'auraluxe_variant_id','') IS NULL
        OR nullif(x->>'bizsathi_product_id','') IS NULL
        OR nullif(x->>'bizsathi_variant_id','') IS NULL
  ) THEN
    RAISE EXCEPTION 'Complete SKU and cross-reference IDs are required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) x
     GROUP BY lower(btrim(x->>'sku')) HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'Duplicate SKU mapping in response';
  END IF;

  PERFORM set_config('app.catalogue_sync_origin','auraluxe',true);
  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    v_sku := lower(btrim(item->>'sku'));
    ap := (item->>'auraluxe_product_id')::uuid;
    av := (item->>'auraluxe_variant_id')::uuid;
    bp := (item->>'bizsathi_product_id')::uuid;
    bv := (item->>'bizsathi_variant_id')::uuid;

    SELECT v.id,v.product_id INTO variant_id,product_id
      FROM public.product_variants v
     WHERE v.business_id=_business_id
       AND lower(btrim(v.sku))=v_sku
       AND v.id=bv
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BizSathi SKU/variant identity changed during Auraluxe mapping';
    END IF;
    IF bp IS DISTINCT FROM product_id THEN
      RAISE EXCEPTION 'Auraluxe mapping returned a product ID that does not own the BizSathi variant';
    END IF;

    UPDATE public.products
       SET auraluxe_product_id=ap
     WHERE business_id=_business_id AND id=product_id;
    UPDATE public.product_variants
       SET auraluxe_variant_id=av
     WHERE business_id=_business_id AND id=variant_id;
    n := n + 1;
  END LOOP;
  RETURN n;
END
$$;

REVOKE ALL ON FUNCTION public.upsert_auraluxe_catalogue_mappings(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_auraluxe_catalogue_mappings(uuid,jsonb) TO service_role;
COMMENT ON FUNCTION public.upsert_auraluxe_catalogue_mappings(uuid,jsonb) IS
'Service-only idempotent persistence of Auraluxe product/variant IDs returned by an authenticated full catalogue reconciliation. Independent of the incremental catalogue publisher switch.';
