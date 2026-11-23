-- Snapshot mapping persistence is service-only, validates the owning BizSathi product,
-- and does not depend on the incremental catalogue publisher switch.
DO $test$
DECLARE
  fn text;
  biz_product uuid;
  biz_variant uuid;
  before_movements integer;
  after_movements integer;
  saved integer;
BEGIN
  fn := pg_get_functiondef('public.upsert_auraluxe_catalogue_mappings(uuid,jsonb)'::regprocedure);
  IF position('service_role' IN fn)=0 OR position('bp IS DISTINCT FROM product_id' IN fn)=0 THEN
    RAISE EXCEPTION 'Auraluxe mapping RPC must require service role and validate product ownership';
  END IF;
  IF position('catalogue_enabled' IN fn)>0 THEN
    RAISE EXCEPTION 'Mapping persistence must not require incremental catalogue publishing to be enabled';
  END IF;
  IF has_function_privilege('anon','public.upsert_auraluxe_catalogue_mappings(uuid,jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.upsert_auraluxe_catalogue_mappings(uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Browser roles must not persist cross-system catalogue mappings';
  END IF;
  IF NOT has_function_privilege('service_role','public.upsert_auraluxe_catalogue_mappings(uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Service role must persist cross-system catalogue mappings';
  END IF;

  SELECT p.id,pv.id INTO biz_product,biz_variant
    FROM public.products p
    JOIN public.product_variants pv ON pv.business_id=p.business_id AND pv.product_id=p.id
   WHERE p.business_id='c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid
     AND pv.sku='SYNC-TEST-ONE';
  IF biz_product IS NULL OR biz_variant IS NULL THEN
    RAISE EXCEPTION 'Expected SKU-first catalogue fixture was not created';
  END IF;

  SELECT count(*) INTO before_movements FROM public.stock_movements WHERE variant_id=biz_variant;
  UPDATE public.auraluxe_sync_control SET catalogue_enabled=false
   WHERE business_id='c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid;
  PERFORM set_config('request.jwt.claim.role','service_role',true);

  saved := public.upsert_auraluxe_catalogue_mappings(
    'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid,
    jsonb_build_array(jsonb_build_object(
      'sku','SYNC-TEST-ONE',
      'auraluxe_product_id','55555555-5555-4555-8555-555555555555',
      'auraluxe_variant_id','66666666-6666-4666-8666-666666666666',
      'bizsathi_product_id',biz_product,
      'bizsathi_variant_id',biz_variant
    ))
  );
  IF saved<>1 THEN
    RAISE EXCEPTION 'Snapshot mapping must save one verified SKU while incremental publishing is disabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products
     WHERE id=biz_product AND auraluxe_product_id='55555555-5555-4555-8555-555555555555'::uuid
  ) OR NOT EXISTS (
    SELECT 1 FROM public.product_variants
     WHERE id=biz_variant AND auraluxe_variant_id='66666666-6666-4666-8666-666666666666'::uuid
  ) THEN
    RAISE EXCEPTION 'Snapshot mapping did not persist both remote identity references';
  END IF;

  BEGIN
    PERFORM public.upsert_auraluxe_catalogue_mappings(
      'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid,
      jsonb_build_array(jsonb_build_object(
        'sku','SYNC-TEST-ONE',
        'auraluxe_product_id','55555555-5555-4555-8555-555555555555',
        'auraluxe_variant_id','66666666-6666-4666-8666-666666666666',
        'bizsathi_product_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'bizsathi_variant_id',biz_variant
      ))
    );
    RAISE EXCEPTION 'Mapping must reject a BizSathi product ID that does not own the variant';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Auraluxe mapping returned a product ID that does not own the BizSathi variant%' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO after_movements FROM public.stock_movements WHERE variant_id=biz_variant;
  IF after_movements<>before_movements THEN
    RAISE EXCEPTION 'Cross-reference persistence must not change stock movements';
  END IF;
  IF coalesce((SELECT catalogue_enabled FROM public.auraluxe_sync_control
    WHERE business_id='c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid),true) THEN
    RAISE EXCEPTION 'Mapping persistence must not enable incremental catalogue publishing';
  END IF;
END
$test$;
