-- 0099: Bind Sutra authorization to the existing AURALUXE business only.
-- Branches remain children of this workspace. No business, membership, branch or ledger rows are changed.
CREATE OR REPLACE FUNCTION public.is_auraluxe_workspace(_business_id uuid)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog
AS $$ SELECT _business_id = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid $$;
REVOKE ALL ON FUNCTION public.is_auraluxe_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_auraluxe_workspace(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.business_role_rank(_business_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS smallint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT CASE
  WHEN NOT public.is_auraluxe_workspace(_business_id) THEN 0::smallint
  WHEN public.platform_owner_check(_user_id) THEN
   (SELECT 100::smallint FROM public.businesses b WHERE b.id=_business_id AND b.archived_at IS NULL)
  ELSE (
   SELECT GREATEST(r.rank,COALESCE(MAX(ar.authority_rank),0))::smallint
   FROM public.business_memberships m
   JOIN public.businesses b ON b.id=m.business_id AND b.archived_at IS NULL
   JOIN public.roles r ON r.code=m.role_code
   LEFT JOIN public.business_member_access_roles a ON a.business_id=m.business_id AND a.user_id=m.user_id
   LEFT JOIN public.business_access_roles ar ON ar.business_id=a.business_id AND ar.id=a.role_id AND ar.is_active
   WHERE m.business_id=_business_id AND m.user_id=_user_id AND m.status='active' AND _user_id IS NOT NULL
   GROUP BY r.rank
  )
 END
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_business uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT public.is_auraluxe_workspace(_business) AND (
  auth.uid() IS NULL OR public.platform_owner_check(auth.uid()) OR (
   COALESCE(public.business_role_rank(_business,auth.uid()),0)>0
   AND NOT EXISTS (SELECT 1 FROM public.member_permission_denials d WHERE d.business_id=_business AND d.user_id=auth.uid() AND d.permission=_perm)
   AND EXISTS (
    SELECT 1 FROM public.business_member_access_roles a
    JOIN public.business_access_roles r ON r.business_id=a.business_id AND r.id=a.role_id AND r.is_active
    JOIN public.business_access_role_permissions rp ON rp.business_id=a.business_id AND rp.role_id=a.role_id
    WHERE a.business_id=_business AND a.user_id=auth.uid() AND rp.permission=_perm
   )
   AND (
    NOT EXISTS (
     SELECT 1 FROM public.business_member_access_roles a
     JOIN public.business_access_roles r ON r.business_id=a.business_id AND r.id=a.role_id AND r.is_active
     WHERE a.business_id=_business AND a.user_id=auth.uid() AND r.code IN ('position_branch_manager','legacy_branch_manager')
    )
    OR COALESCE(public.business_role_rank(_business,auth.uid()),0)>50
    OR _perm = ANY(ARRAY[
     'hr.self.view','hr.attendance.view','hr.leave.view','hr.leave.create','hr.shifts.view','staff.edit',
     'sales.view','sales.create','expenses.view','inventory.view','categories.view','stock.create','stock.edit',
     'customers.create','customers.edit','customers.view','suppliers.view','staff.view','reports.view',
     'reports.home_stats','reports.expenses','reports.items','reports.parties','reports.transactions'
    ]::text[])
   )
  )
 )
$$;

CREATE OR REPLACE FUNCTION public.team_invite_authority(_actor uuid, _business_id uuid, _branch_id uuid, _role text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE actor_rank smallint; target_rank smallint;
BEGIN
 IF _actor IS NULL OR _role IS NULL OR _role='owner' OR NOT public.is_auraluxe_workspace(_business_id) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=_business_id AND archived_at IS NULL) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.branches WHERE id=_branch_id AND business_id=_business_id AND is_active) THEN RETURN false; END IF;
 SELECT rank INTO target_rank FROM public.roles WHERE code=_role;
 IF target_rank IS NULL THEN RETURN false; END IF;
 IF public.platform_owner_check(_actor) THEN RETURN true; END IF;
 actor_rank:=public.business_role_rank(_business_id,_actor);
 IF actor_rank IS NULL THEN RETURN false; END IF;
 IF actor_rank>=80 THEN RETURN target_rank<actor_rank; END IF;
 RETURN target_rank<actor_rank AND target_rank<80
  AND EXISTS(SELECT 1 FROM public.delegation_grants g WHERE g.business_id=_business_id AND g.branch_id=_branch_id AND g.manager_user_id=_actor AND g.revoked_at IS NULL AND g.can_invite AND _role=ANY(g.allowed_role_codes))
  AND EXISTS(SELECT 1 FROM public.branch_memberships bm WHERE bm.business_id=_business_id AND bm.branch_id=_branch_id AND bm.user_id=_actor);
END
$$;

CREATE OR REPLACE FUNCTION public.list_business_archive_requests(_business_id uuid)
RETURNS TABLE(id uuid,business_id uuid,requested_by uuid,request_reason text,status text,reviewed_by uuid,review_note text,created_at timestamptz,reviewed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
 IF NOT public.is_auraluxe_workspace(_business_id) THEN RAISE EXCEPTION 'Sutra is configured for AURALUXE only' USING ERRCODE='42501'; END IF;
 IF NOT public.platform_owner_check(auth.uid()) AND NOT EXISTS(
  SELECT 1 FROM public.business_memberships m WHERE m.business_id=_business_id AND m.user_id=auth.uid() AND m.role_code='owner' AND m.status='active'
 ) THEN RAISE EXCEPTION 'Only this Business Owner or the platform Master Owner can view archive requests' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT r.id,r.business_id,r.requested_by,r.request_reason,r.status,r.reviewed_by,r.review_note,r.created_at,r.reviewed_at
 FROM public.business_archive_requests r WHERE r.business_id=_business_id ORDER BY r.created_at DESC;
END
$$;

CREATE OR REPLACE FUNCTION public.review_business_archive_request(_request_id uuid,_approve boolean,_review_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE actor uuid:=auth.uid(); archive_request public.business_archive_requests%ROWTYPE;
BEGIN
 IF actor IS NULL OR NOT public.platform_owner_check(actor) THEN RAISE EXCEPTION 'Only the platform Master Owner can review business archive requests' USING ERRCODE='42501'; END IF;
 IF _review_note IS NOT NULL AND char_length(_review_note)>1000 THEN RAISE EXCEPTION 'Review note must be 1000 characters or fewer' USING ERRCODE='22023'; END IF;
 SELECT * INTO archive_request FROM public.business_archive_requests WHERE id=_request_id FOR UPDATE;
 IF NOT FOUND OR archive_request.status<>'pending' THEN RAISE EXCEPTION 'Pending archive request not found' USING ERRCODE='P0002'; END IF;
 IF NOT public.is_auraluxe_workspace(archive_request.business_id) THEN RAISE EXCEPTION 'Sutra is configured for AURALUXE only' USING ERRCODE='42501'; END IF;
 IF _approve THEN
  UPDATE public.businesses SET archived_at=now() WHERE id=archive_request.business_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business is already archived or unavailable' USING ERRCODE='P0002'; END IF;
 END IF;
 UPDATE public.business_archive_requests SET status=CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,reviewed_by=actor,review_note=NULLIF(btrim(_review_note),''),reviewed_at=now() WHERE id=_request_id;
 PERFORM public.write_audit(archive_request.business_id,CASE WHEN _approve THEN 'business.archive_approved' ELSE 'business.archive_rejected' END,'business_archive_requests',_request_id::text,jsonb_build_object('status','pending'),jsonb_build_object('status',CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,'reviewed_by',actor,'review_note',NULLIF(btrim(_review_note),'')));
 IF _approve THEN PERFORM public.write_audit(archive_request.business_id,'business.archived','businesses',archive_request.business_id::text,NULL,jsonb_build_object('archived_at',now(),'approved_by',actor,'archive_request_id',_request_id)); END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.transfer_business_ownership(_business_id uuid,_new_owner uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE actor uuid:=auth.uid(); old_owner uuid; target_member uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF NOT public.is_auraluxe_workspace(_business_id) THEN RAISE EXCEPTION 'Sutra is configured for AURALUXE only' USING ERRCODE='42501'; END IF;
 IF public.platform_owner_check(actor) THEN RAISE EXCEPTION 'Platform Master Owner cannot transfer business ownership through the business workflow' USING ERRCODE='42501'; END IF;
 IF _new_owner IS NULL OR _new_owner=actor THEN RAISE EXCEPTION 'Choose another active business member' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.businesses WHERE id=_business_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Business unavailable' USING ERRCODE='42501'; END IF;
 SELECT user_id INTO old_owner FROM public.business_memberships WHERE business_id=_business_id AND user_id=actor AND role_code='owner' AND status='active' FOR UPDATE;
 IF old_owner IS NULL THEN RAISE EXCEPTION 'Only this business''s active Business Owner can transfer ownership' USING ERRCODE='42501'; END IF;
 IF public.platform_owner_check(_new_owner) THEN RAISE EXCEPTION 'Platform Master Owner cannot be assigned through business ownership transfer' USING ERRCODE='42501'; END IF;
 SELECT user_id INTO target_member FROM public.business_memberships WHERE business_id=_business_id AND user_id=_new_owner AND status='active' FOR UPDATE;
 IF target_member IS NULL THEN RAISE EXCEPTION 'New owner must be an active member of this business' USING ERRCODE='42501'; END IF;
 UPDATE public.business_memberships SET role_code='admin' WHERE business_id=_business_id AND user_id=old_owner;
 UPDATE public.business_memberships SET role_code='owner' WHERE business_id=_business_id AND user_id=target_member;
 PERFORM public.write_audit(_business_id,'ownership.transfer','business_memberships',target_member::text,jsonb_build_object('owner_user_id',old_owner),jsonb_build_object('owner_user_id',target_member,'transferred_by',actor));
END
$$;

DROP POLICY IF EXISTS audit_select_platform_owner ON public.audit_logs;
CREATE POLICY audit_select_platform_owner ON public.audit_logs FOR SELECT TO authenticated
USING(public.is_platform_owner() AND public.is_auraluxe_workspace(business_id));

COMMENT ON FUNCTION public.is_auraluxe_workspace(uuid)
IS 'True only for Sutra by Auraluxe production workspace; branch data remains scoped under this business.';
