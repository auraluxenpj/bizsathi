-- 0125: accept Auraluxe product-name edits only for the mapped Auraluxe business.
CREATE OR REPLACE FUNCTION public.apply_auraluxe_product_name(
  _auraluxe_product_id uuid,
  _name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_id uuid;
  v_count integer;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Service authorization required';
  END IF;
  IF _auraluxe_product_id IS NULL
     OR _name IS NULL
     OR length(btrim(_name)) NOT BETWEEN 2 AND 150
     OR _name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'A valid Auraluxe product ID and product name are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_auraluxe_product_id::text, 25));
  SELECT count(*), min(p.id)
    INTO v_count, v_product_id
    FROM public.products p
   WHERE p.business_id = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid
     AND p.auraluxe_product_id = _auraluxe_product_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Auraluxe product mapping is missing or ambiguous';
  END IF;

  PERFORM set_config('app.catalogue_sync_origin','auraluxe',true);
  UPDATE public.products
     SET name = btrim(_name)
   WHERE id = v_product_id
     AND business_id = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid
     AND auraluxe_product_id = _auraluxe_product_id;

  RETURN jsonb_build_object('ok',true,'product_id',v_product_id,'name',btrim(_name));
END;
$$;

REVOKE ALL ON FUNCTION public.apply_auraluxe_product_name(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_auraluxe_product_name(uuid,text) TO service_role;
COMMENT ON FUNCTION public.apply_auraluxe_product_name(uuid,text) IS
  'Updates only the name of the uniquely mapped Auraluxe product in the fixed Auraluxe business; suppresses catalogue echo.';
