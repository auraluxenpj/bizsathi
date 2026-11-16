-- 0045: Enforce strict delegated rank ceilings and serialize delegation revocation with invitation writes/acceptance.
-- ADDITIVE function replacements only. Reuses 0042 tables and RPC contracts; no business data is rewritten.
-- Apply to isolated staging first. Do not apply to production until the complete team-access rollout is approved.

CREATE OR REPLACE FUNCTION public.team_invite_authority(_actor uuid, _business_id uuid, _branch_id uuid, _role text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE actor_rank smallint; target_rank smallint;
BEGIN
  IF _actor IS NULL OR _role IS NULL OR _role = 'owner' THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = _business_id AND archived_at IS NULL) THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = _branch_id AND business_id = _business_id AND is_active) THEN RETURN false; END IF;
  SELECT rank INTO target_rank FROM public.roles WHERE code = _role;
  IF target_rank IS NULL THEN RETURN false; END IF;
  IF public.platform_owner_check(_actor) THEN RETURN true; END IF;
  actor_rank := public.business_role_rank(_business_id, _actor);
  IF actor_rank IS NULL THEN RETURN false; END IF;
  IF actor_rank >= 80 THEN RETURN target_rank < actor_rank; END IF;

  -- A delegated manager can invite only strictly lower-ranked roles.
  RETURN target_rank < actor_rank
    AND target_rank < 80
    AND EXISTS (
      SELECT 1 FROM public.delegation_grants g
      WHERE g.business_id = _business_id AND g.branch_id = _branch_id
        AND g.manager_user_id = _actor AND g.revoked_at IS NULL
        AND g.can_invite AND _role = ANY (g.allowed_role_codes)
    )
    AND EXISTS (
      SELECT 1 FROM public.branch_memberships bm
      WHERE bm.business_id = _business_id AND bm.branch_id = _branch_id AND bm.user_id = _actor
    );
END $$;

CREATE OR REPLACE FUNCTION public.grant_branch_delegation(
  _business_id uuid, _branch_id uuid, _manager uuid, _roles text[],
  _max_uses int DEFAULT 25, _max_days int DEFAULT 14
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); actor_rank smallint; mgr_rank smallint; gid uuid; r text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;

  IF NOT public.platform_owner_check(actor) THEN
    PERFORM 1 FROM public.business_memberships
    WHERE business_id = _business_id AND user_id = actor AND status = 'active'
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  END IF;

  actor_rank := public.business_role_rank(_business_id, actor);
  IF actor_rank IS NULL OR actor_rank < 80 THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF _manager = actor THEN RAISE EXCEPTION 'You cannot delegate authority to yourself' USING ERRCODE = '42501'; END IF;

  -- Lock the manager membership while validating the rank ceiling.
  PERFORM 1 FROM public.business_memberships
  WHERE business_id = _business_id AND user_id = _manager AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Manager must have an active business membership' USING ERRCODE = '42501'; END IF;

  mgr_rank := public.business_role_rank(_business_id, _manager);
  IF mgr_rank IS NULL OR mgr_rank >= actor_rank OR public.platform_owner_check(_manager) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.branches
  WHERE id = _branch_id AND business_id = _business_id AND is_active
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active branch not found' USING ERRCODE = '42501'; END IF;

  PERFORM 1 FROM public.branch_memberships
  WHERE business_id = _business_id AND branch_id = _branch_id AND user_id = _manager
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Give the manager access to this branch first' USING ERRCODE = '42501'; END IF;

  IF _roles IS NULL OR cardinality(_roles) NOT BETWEEN 1 AND 10
     OR _max_uses NOT BETWEEN 1 AND 100 OR _max_days NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Invalid delegation settings';
  END IF;

  FOREACH r IN ARRAY _roles LOOP
    IF NOT EXISTS (SELECT 1 FROM public.roles WHERE code = r AND rank < mgr_rank) THEN
      RAISE EXCEPTION 'Role % must be strictly below the manager rank', r USING ERRCODE = '42501';
    END IF;
  END LOOP;

  UPDATE public.delegation_grants
  SET revoked_at = now(), revoked_by = actor
  WHERE business_id = _business_id AND branch_id = _branch_id
    AND manager_user_id = _manager AND revoked_at IS NULL;

  INSERT INTO public.delegation_grants
    (business_id, branch_id, manager_user_id, allowed_role_codes, max_invite_uses, max_invite_days, granted_by)
  VALUES (_business_id, _branch_id, _manager, _roles, _max_uses, _max_days, actor)
  RETURNING id INTO gid;

  PERFORM public.write_audit(_business_id, 'delegation.grant', 'delegation_grants', gid::text, NULL,
    jsonb_build_object('manager', _manager, 'branch', _branch_id, 'roles', _roles));
  RETURN gid;
END $$;

CREATE OR REPLACE FUNCTION public.create_team_invitation(
  _business_id uuid, _branch_id uuid, _role text, _job_title text, _denied text[],
  _token_hash text, _expires_at timestamptz, _max_uses int, _label text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); iid uuid; actor_rank smallint; g public.delegation_grants; p text; cdef text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT public.team_invite_authority(actor, _business_id, _branch_id, _role) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid invitation token'; END IF;
  IF _expires_at IS NULL OR _expires_at < now() + interval '5 minutes'
     OR _expires_at > now() + interval '30 days' THEN
    RAISE EXCEPTION 'Expiry must be between 5 minutes and 30 days from now';
  END IF;
  IF _max_uses IS NULL OR _max_uses < 1 OR _max_uses > 100 THEN
    RAISE EXCEPTION 'Maximum registrations must be between 1 and 100';
  END IF;
  IF _job_title IS NOT NULL AND public.job_title_role(_job_title) IS DISTINCT FROM _role THEN
    RAISE EXCEPTION 'Job title does not match the role';
  END IF;

  _denied := COALESCE(_denied, '{}');
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint
  WHERE conname = 'member_permission_denials_permission_check'
    AND conrelid = 'public.member_permission_denials'::regclass;
  FOREACH p IN ARRAY _denied LOOP
    IF cdef IS NULL OR position(quote_literal(p) IN cdef) = 0 THEN
      RAISE EXCEPTION 'Unknown permission %', p;
    END IF;
  END LOOP;

  IF NOT public.platform_owner_check(actor) THEN
    actor_rank := public.business_role_rank(_business_id, actor);
    IF actor_rank < 80 THEN
      -- Lock the exact active grant so a concurrent revoke cannot race invitation creation.
      SELECT * INTO g FROM public.delegation_grants
      WHERE business_id = _business_id AND branch_id = _branch_id
        AND manager_user_id = actor AND revoked_at IS NULL
        AND can_invite AND _role = ANY (allowed_role_codes)
      FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Delegation is no longer active' USING ERRCODE = '42501'; END IF;
      IF _max_uses > g.max_invite_uses
         OR _expires_at > now() + make_interval(days => g.max_invite_days) THEN
        RAISE EXCEPTION 'Exceeds your delegation limits' USING ERRCODE = '42501';
      END IF;
      -- A delegate cannot hand out permissions they themselves have been denied.
      IF EXISTS (
        SELECT 1 FROM public.member_permission_denials d
        WHERE d.business_id = _business_id AND d.user_id = actor
          AND NOT (d.permission = ANY (_denied))
      ) THEN
        RAISE EXCEPTION 'You cannot grant permissions you do not have' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.team_invitations
    (business_id, branch_id, role_code, job_title, denied_permissions, token_hash, label, invited_by, expires_at, max_uses)
  VALUES (_business_id, _branch_id, _role, _job_title, _denied, _token_hash, _label, actor, _expires_at, _max_uses)
  RETURNING id INTO iid;

  PERFORM public.write_audit(_business_id, 'team_invite.create', 'team_invitations', iid::text, NULL,
    jsonb_build_object('branch', _branch_id, 'role', _role, 'max_uses', _max_uses, 'expires_at', _expires_at));
  RETURN iid;
END $$;

CREATE OR REPLACE FUNCTION public.accept_team_invitation(_token_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); i public.team_invitations; au record; mobile text; m public.business_memberships;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;

  SELECT email_confirmed_at, phone_confirmed_at, phone INTO au
  FROM auth.users WHERE id = actor;
  mobile := public.normalize_member_mobile(au.phone);
  IF au.email_confirmed_at IS NULL OR au.phone_confirmed_at IS NULL OR mobile IS NULL THEN
    RAISE EXCEPTION 'Verify your email and mobile number first' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO i FROM public.team_invitations WHERE token_hash = _token_hash FOR UPDATE;
  IF i.id IS NULL OR i.revoked_at IS NOT NULL OR i.expires_at <= now()
     OR i.use_count >= i.max_uses OR i.invited_by = actor THEN
    RAISE EXCEPTION 'Invitation unavailable for this account' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.team_invitation_uses WHERE invitation_id = i.id AND user_id = actor) THEN
    RAISE EXCEPTION 'Invitation unavailable for this account' USING ERRCODE = '42501';
  END IF;

  -- Lock the inviter membership and (for a delegated manager) the delegation and branch grants.
  -- Revocation/role changes must serialize with acceptance; a revoked grant cannot be used afterward.
  IF NOT public.platform_owner_check(i.invited_by) THEN
    PERFORM 1 FROM public.business_memberships
    WHERE business_id = i.business_id AND user_id = i.invited_by AND status = 'active'
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invitation no longer authorized' USING ERRCODE = '42501'; END IF;

    IF COALESCE(public.business_role_rank(i.business_id, i.invited_by), 0) < 80 THEN
      PERFORM 1 FROM public.delegation_grants
      WHERE business_id = i.business_id AND branch_id = i.branch_id
        AND manager_user_id = i.invited_by AND revoked_at IS NULL
        AND can_invite AND i.role_code = ANY (allowed_role_codes)
      FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invitation no longer authorized' USING ERRCODE = '42501'; END IF;

      PERFORM 1 FROM public.branch_memberships
      WHERE business_id = i.business_id AND branch_id = i.branch_id AND user_id = i.invited_by
      FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invitation no longer authorized' USING ERRCODE = '42501'; END IF;
    END IF;
  END IF;

  IF NOT public.team_invite_authority(i.invited_by, i.business_id, i.branch_id, i.role_code) THEN
    RAISE EXCEPTION 'Invitation no longer authorized' USING ERRCODE = '42501';
  END IF;

  BEGIN
    UPDATE public.profiles SET phone = mobile
    WHERE id = actor AND phone IS DISTINCT FROM mobile;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This mobile number is already registered' USING ERRCODE = '42501';
  END;

  SELECT * INTO m FROM public.business_memberships
  WHERE business_id = i.business_id AND user_id = actor FOR UPDATE;
  IF m.id IS NULL THEN
    INSERT INTO public.business_memberships (business_id, user_id, role_code, job_title, invited_by)
    VALUES (i.business_id, actor, i.role_code, i.job_title, i.invited_by);
    INSERT INTO public.member_permission_denials (business_id, user_id, permission, granted_by)
      SELECT i.business_id, actor, d.permission, i.invited_by
      FROM public.job_title_denials d
      WHERE i.job_title IS NOT NULL AND d.job_title = i.job_title
      UNION
      SELECT i.business_id, actor, unnest(i.denied_permissions), i.invited_by
      ON CONFLICT DO NOTHING;
  ELSIF m.status <> 'active' THEN
    RAISE EXCEPTION 'Invitation unavailable for this account' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.branch_memberships (business_id, branch_id, user_id, granted_by)
  VALUES (i.business_id, i.branch_id, actor, i.invited_by)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.team_invitation_uses
    (invitation_id, business_id, user_id, email_verified_at, phone_verified_at)
  VALUES (i.id, i.business_id, actor, au.email_confirmed_at, au.phone_confirmed_at);
  UPDATE public.team_invitations SET use_count = use_count + 1 WHERE id = i.id;
  PERFORM public.write_audit(i.business_id, 'team_invite.accept', 'team_invitations', i.id::text, NULL,
    jsonb_build_object('branch', i.branch_id, 'role', i.role_code));
  RETURN i.business_id;
END $$;
