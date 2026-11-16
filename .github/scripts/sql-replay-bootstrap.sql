-- Test-only compatibility bootstrap for the isolated migration replay.
-- Migration 0021 is intentionally a no-op because its objects already exist in
-- the hosted database. It therefore does not create this helper on a clean DB,
-- while migration 0025 still references it. Reproduce the helper definition
-- from 0021 here so the disposable replay can continue without changing any
-- historical migration or hosted database.
CREATE OR REPLACE FUNCTION public.bill_object_business(_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN split_part(_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(_name, '/', 1)::uuid
  END
$$;

REVOKE EXECUTE ON FUNCTION public.bill_object_business(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bill_object_business(text) TO authenticated;
