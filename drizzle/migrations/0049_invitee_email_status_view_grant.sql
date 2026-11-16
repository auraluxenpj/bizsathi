-- 0049: Allow authenticated inviters to read invitee email only on invitation rows already visible under RLS.
-- The security-invoker status view masks the value before returning it to the client.
GRANT SELECT (invitee_email) ON public.team_invitations TO authenticated;
