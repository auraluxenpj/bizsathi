-- 0047: Allow authenticated invite managers to read the invitee phone only on rows RLS already permits.
-- Required by the security-invoker status view, which exposes a masked value.
GRANT SELECT (invitee_mobile) ON public.team_invitations TO authenticated;
