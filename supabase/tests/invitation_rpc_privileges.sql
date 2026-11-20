-- Verify invitation RPC grants: listing is authenticated-only, while
-- token-hash preview remains intentionally available before sign-in.
BEGIN;
DO $tests$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.list_business_invitations(uuid)', 'EXECUTE'),
    'Anonymous users must not execute business invitation listing';
  ASSERT has_function_privilege('authenticated', 'public.list_business_invitations(uuid)', 'EXECUTE'),
    'Authenticated users must retain business invitation listing';
  ASSERT has_function_privilege('service_role', 'public.list_business_invitations(uuid)', 'EXECUTE'),
    'Service role must retain business invitation listing';
  ASSERT has_function_privilege('anon', 'public.preview_team_invitation(text)', 'EXECUTE'),
    'Anonymous token-hash invitation preview remains available before sign-in';
  RAISE NOTICE 'INVITATION_RPC_PRIVILEGE_TESTS_PASSED';
END
$tests$;
ROLLBACK;
