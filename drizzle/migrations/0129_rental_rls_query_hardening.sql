-- 0129: RLS query-plan hardening for the isolated rental workspace.
-- This is additive and does not alter the existing AURALUXE policies or records.

CREATE OR REPLACE FUNCTION rental_private.is_member(_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT (select auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.rental_memberships m
    JOIN public.rental_workspaces w ON w.id=m.workspace_id AND w.archived_at IS NULL
    WHERE m.workspace_id=_workspace AND m.user_id=(select auth.uid()) AND m.status='active'
  );
$fn$;

CREATE OR REPLACE FUNCTION rental_private.has_role(_workspace uuid,_minimum text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.rental_workspaces w WHERE w.id=_workspace AND w.archived_at IS NULL)
    AND CASE _minimum
      WHEN 'owner' THEN EXISTS (SELECT 1 FROM public.rental_memberships m WHERE m.workspace_id=_workspace AND m.user_id=(select auth.uid()) AND m.status='active' AND m.role='owner')
      WHEN 'accountant' THEN EXISTS (SELECT 1 FROM public.rental_memberships m WHERE m.workspace_id=_workspace AND m.user_id=(select auth.uid()) AND m.status='active' AND m.role IN ('owner','accountant'))
      WHEN 'viewer' THEN rental_private.is_member(_workspace)
      ELSE false
    END;
$fn$;

DROP POLICY IF EXISTS rental_workspaces_select ON public.rental_workspaces;
CREATE POLICY rental_workspaces_select ON public.rental_workspaces
  FOR SELECT TO authenticated USING ((select rental_private.is_member(id)) OR (select public.is_platform_owner()));

DROP POLICY IF EXISTS rental_memberships_select ON public.rental_memberships;
CREATE POLICY rental_memberships_select ON public.rental_memberships
  FOR SELECT TO authenticated USING (user_id=(select auth.uid()) OR rental_private.has_role(workspace_id,'owner'));

DROP POLICY IF EXISTS rental_invoice_sequences_deny ON public.rental_invoice_sequences;
CREATE POLICY rental_invoice_sequences_deny ON public.rental_invoice_sequences
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
