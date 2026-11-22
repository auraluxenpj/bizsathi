-- Remove the one-time production test RPC and its completion marker after successful verification.
DROP FUNCTION IF EXISTS public.run_controlled_inventory_test();
DROP TABLE IF EXISTS public.website_inventory_controlled_test_runs;
