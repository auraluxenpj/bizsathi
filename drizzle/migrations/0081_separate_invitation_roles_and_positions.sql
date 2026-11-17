-- 0081: make invitations carry independent authority role and HR position.
-- Invitation access rank and HR position are independent. Initial access permissions
-- are derived from the invitation's assigned permission role; additional roles are
-- assigned after acceptance through the employee access screen.
DROP TRIGGER IF EXISTS apply_invited_job_title ON public.business_memberships;

CREATE OR REPLACE FUNCTION public.accept_business_invitation(_token_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $accept_business_invitation$
DECLARE
  i public.business_invitations;
  inviter_rank smallint;
  target_rank smallint;
  verified_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT lower(email) INTO verified_email
  FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
  SELECT * INTO i FROM public.business_invitations WHERE token_hash=_token_hash FOR UPDATE;
  SELECT rank INTO target_rank FROM public.roles WHERE code=i.role_code;
  IF i.id IS NULL OR i.revoked_at IS NOT NULL OR i.accepted_at IS NOT NULL OR i.expires_at<=now()
     OR verified_email IS NULL OR verified_email<>i.email OR i.invited_by=auth.uid()
     OR target_rank IS NULL OR i.role_code='owner' THEN
    RAISE EXCEPTION 'Invitation unavailable for this account' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.business_memberships
  WHERE business_id=i.business_id AND user_id=i.invited_by FOR UPDATE;
  inviter_rank:=public.business_role_rank(i.business_id,i.invited_by);
  IF inviter_rank IS NULL OR inviter_rank<80 OR target_rank>=inviter_rank
     OR NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=i.business_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Invitation no longer authorized' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.business_memberships(business_id,user_id,role_code,job_title,invited_by)
  VALUES(i.business_id,auth.uid(),i.role_code,i.job_title,i.invited_by);
  UPDATE public.business_invitations SET accepted_at=now() WHERE id=i.id;
  PERFORM public.write_audit(i.business_id,'accept_invite','business_invitations',i.id::text,NULL,NULL);
  RETURN i.business_id;
END;
$accept_business_invitation$;
REVOKE ALL ON FUNCTION public.accept_business_invitation(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_business_invitation(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_invitation_job_title(_business uuid,_invitation uuid,_title text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $set_invitation_job_title$
BEGIN
  IF COALESCE(public.business_role_rank(_business,auth.uid()),0)<80 THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF _title IS NOT NULL AND public.job_title_role(_title) IS NULL THEN
    RAISE EXCEPTION 'Unknown position';
  END IF;
  UPDATE public.business_invitations
  SET job_title=_title
  WHERE id=_invitation AND business_id=_business AND accepted_at IS NULL AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found or no longer editable'; END IF;
END;
$set_invitation_job_title$;
REVOKE ALL ON FUNCTION public.set_invitation_job_title(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_invitation_job_title(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_team_invitation(
  _business_id uuid,_branch_id uuid,_role text,_job_title text,_denied text[],
  _invitee_email text,_invitee_mobile text,_token_hash text,
  _expires_at timestamptz,_max_uses integer,_label text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $create_team_invitation$
DECLARE
  actor uuid := auth.uid();
  iid uuid;
  actor_rank smallint;
  g public.delegation_grants;
  p text;
  cdef text;
  mobile text;
  invited_email text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT public.team_invite_authority(actor,_business_id,_branch_id,_role) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;

  actor_rank := public.business_role_rank(_business_id,actor);
  IF NOT public.platform_owner_check(actor) AND actor_rank<=50
     AND EXISTS (
       SELECT 1 FROM public.business_memberships m
       WHERE m.business_id=_business_id AND m.user_id=actor AND m.status='active'
         AND m.role_code='branch_manager'
     )
     AND NOT (
       public.has_business_access_role(_business_id,'position_branch_manager')
       OR public.has_business_access_role(_business_id,'legacy_branch_manager')
     ) THEN
    RAISE EXCEPTION 'Branch Manager access role is required' USING ERRCODE='42501';
  END IF;

  invited_email := lower(trim(_invitee_email));
  IF invited_email IS NULL OR length(invited_email)>254
     OR invited_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid invitee email address';
  END IF;
  mobile := public.normalize_member_mobile(_invitee_mobile);
  IF mobile IS NULL THEN RAISE EXCEPTION 'Enter a valid Nepal mobile number'; END IF;
  IF _max_uses IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Phone-bound invitations are single-use only'; END IF;
  IF _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid invitation token';
  END IF;
  IF _expires_at IS NULL OR _expires_at<now()+interval '5 minutes'
     OR _expires_at>now()+interval '30 days' THEN
    RAISE EXCEPTION 'Expiry must be between 5 minutes and 30 days from now';
  END IF;
  IF _job_title IS NOT NULL AND public.job_title_role(_job_title) IS NULL THEN
    RAISE EXCEPTION 'Unknown HR position';
  END IF;

  _denied := COALESCE(_denied,'{}');
  IF NOT public.platform_owner_check(actor) THEN
    SELECT COALESCE(array_agg(permission ORDER BY permission),ARRAY[]::text[])
    INTO _denied
    FROM (
      SELECT unnest(_denied) AS permission
      UNION
      SELECT d.permission FROM public.member_permission_denials d
      WHERE d.business_id=_business_id AND d.user_id=actor
      UNION
      SELECT p.permission
      FROM public.business_permission_catalog p
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.business_member_access_roles a
        JOIN public.business_access_roles r
          ON r.business_id=a.business_id AND r.id=a.role_id AND r.is_active
        JOIN public.business_access_role_permissions rp
          ON rp.business_id=a.business_id AND rp.role_id=a.role_id
        WHERE a.business_id=_business_id AND a.user_id=actor
          AND rp.permission=p.permission
      )
    ) effective_denials;
  END IF;

  IF cardinality(_denied)>80 THEN RAISE EXCEPTION 'Too many permission restrictions'; END IF;
  SELECT pg_get_constraintdef(oid) INTO cdef
  FROM pg_constraint
  WHERE conname='member_permission_denials_permission_check'
    AND conrelid='public.member_permission_denials'::regclass;
  FOREACH p IN ARRAY _denied LOOP
    IF cdef IS NULL OR position(quote_literal(p) IN cdef)=0 THEN
      RAISE EXCEPTION 'Unknown permission %',p;
    END IF;
  END LOOP;

  IF NOT public.platform_owner_check(actor) AND actor_rank<80 THEN
    SELECT * INTO g
    FROM public.delegation_grants
    WHERE business_id=_business_id AND branch_id=_branch_id
      AND manager_user_id=actor AND revoked_at IS NULL
      AND can_invite AND _role=ANY(allowed_role_codes)
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Delegation is no longer active' USING ERRCODE='42501'; END IF;
    IF _max_uses>g.max_invite_uses
       OR _expires_at>now()+make_interval(days=>g.max_invite_days) THEN
      RAISE EXCEPTION 'Exceeds your delegation limits' USING ERRCODE='42501';
    END IF;
  END IF;

  INSERT INTO public.team_invitations
    (business_id,branch_id,role_code,job_title,denied_permissions,invitee_email,invitee_mobile,
     token_hash,label,invited_by,expires_at,max_uses)
  VALUES (_business_id,_branch_id,_role,_job_title,_denied,invited_email,mobile,
          _token_hash,_label,actor,_expires_at,1)
  RETURNING id INTO iid;

  PERFORM public.write_audit(_business_id,'team_invite.create','team_invitations',iid::text,NULL,
    jsonb_build_object('branch',_branch_id,'position',_job_title,
      'invitee_email_domain',split_part(invited_email,'@',2),
      'invitee_mobile_last4',right(mobile,4),'max_uses',1,'expires_at',_expires_at));
  RETURN iid;
END;
$create_team_invitation$;
REVOKE ALL ON FUNCTION public.create_team_invitation(uuid,uuid,text,text,text[],text,text,text,timestamptz,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_team_invitation(uuid,uuid,text,text,text[],text,text,text,timestamptz,integer,text) TO authenticated;

