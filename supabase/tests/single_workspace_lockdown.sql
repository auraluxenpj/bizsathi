-- Verify the single-workspace database lockdown after applying migration 0041.
-- Run in a disposable test database with the project migrations applied.
DO $tests$
DECLARE fn regprocedure := to_regprocedure('public.create_business(text,text,text)');
BEGIN
  ASSERT fn IS NOT NULL, 'create_business compatibility function must remain present';
  ASSERT NOT has_function_privilege('anon', fn, 'EXECUTE'), 'anon must not execute create_business';
  ASSERT NOT has_function_privilege('authenticated', fn, 'EXECUTE'), 'authenticated must not execute create_business';
  ASSERT NOT has_function_privilege('service_role', fn, 'EXECUTE'), 'service_role must not execute create_business';
  ASSERT position('Business registration is disabled' IN pg_get_functiondef(fn)) > 0,
    'create_business must reject calls with the single-workspace message';
END;
$tests$;
