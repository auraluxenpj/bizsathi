-- 0133: allow the rental owner to revoke existing employee access and audit membership changes.

CREATE OR REPLACE FUNCTION rental_private.deactivate_member(_workspace uuid,_member uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF NOT rental_private.has_role(_workspace,'owner') THEN
    RAISE EXCEPTION 'Rental workspace owner access is required' USING ERRCODE='42501';
  END IF;
  UPDATE public.rental_memberships
     SET status='inactive',updated_at=now()
   WHERE workspace_id=_workspace AND id=_member AND role<>'owner' AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Member was not found or cannot be deactivated'; END IF;
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.deactivate_rental_member(_workspace uuid,_member uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT rental_private.deactivate_member(_workspace,_member); $fn$;

REVOKE ALL ON FUNCTION rental_private.deactivate_member(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rental_private.deactivate_member(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.deactivate_rental_member(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.deactivate_rental_member(uuid,uuid) TO authenticated;

DROP TRIGGER IF EXISTS rental_memberships_audit ON public.rental_memberships;
CREATE TRIGGER rental_memberships_audit
  AFTER INSERT OR UPDATE ON public.rental_memberships
  FOR EACH ROW EXECUTE FUNCTION rental_private.audit_row();
