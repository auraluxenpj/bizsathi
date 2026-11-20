-- 0104: restore the invitation-listing RPC and restrict it to authenticated callers.
-- The production migration history contains this RPC, but the function definition
-- was missing from the repository replay. Keep clean database replays self-contained.
CREATE OR REPLACE FUNCTION public.list_business_invitations(_business uuid)
RETURNS TABLE(
  id uuid,
  email text,
  job_title text,
  role_code text,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT i.id, i.email, i.job_title, i.role_code, i.expires_at,
         i.accepted_at, i.revoked_at, i.created_at
  FROM public.business_invitations AS i
  WHERE i.business_id = _business
    AND auth.uid() IS NOT NULL
    AND public.has_business_role(_business_id => _business, _min_role => 'admin')
  ORDER BY i.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.list_business_invitations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_business_invitations(uuid) TO authenticated, service_role;
