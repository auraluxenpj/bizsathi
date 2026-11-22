-- Privilege and scope regression for the one-time production test RPC.
DO $$
BEGIN
  IF has_function_privilege('anon','public.run_controlled_inventory_test()','EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute the controlled inventory test';
  END IF;
  IF has_function_privilege('authenticated','public.run_controlled_inventory_test()','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute the controlled inventory test';
  END IF;
  IF NOT has_function_privilege('service_role','public.run_controlled_inventory_test()','EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute the controlled inventory test';
  END IF;
END $$;
