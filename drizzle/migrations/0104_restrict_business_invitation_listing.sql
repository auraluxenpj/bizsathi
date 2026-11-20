-- 0104: restrict business invitation listing to authenticated callers.
-- The function already enforces an active administrator membership; the grant
-- must also prevent anonymous callers from invoking this SECURITY DEFINER RPC.
REVOKE ALL ON FUNCTION public.list_business_invitations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_business_invitations(uuid) TO authenticated, service_role;
