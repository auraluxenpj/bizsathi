-- Snapshot mapping persistence is service-only, validates the owning BizSathi product,
-- and does not depend on the incremental catalogue publisher switch.
DO $test$
DECLARE
  fn text;
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
END
$test$;
