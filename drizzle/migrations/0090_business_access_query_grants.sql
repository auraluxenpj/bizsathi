-- 0090: grant the authenticated server role the SELECT privileges required by
-- the existing RLS-protected Business Access and invitation history queries.
-- Row-level policies remain the authorization boundary for each business.
GRANT SELECT ON public.business_invitations TO authenticated;
GRANT SELECT ON public.team_invitations TO authenticated;
GRANT SELECT ON public.team_invitations_status TO authenticated;
GRANT SELECT ON public.team_invitation_uses TO authenticated;
