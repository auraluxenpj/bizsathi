-- 0046: Bind new branch-scoped team invitations to a verified Nepal mobile number.
-- Additive and staging-first. Existing invitation rows are preserved; unbound legacy team links
-- cannot be accepted through the hardened flow after this migration.
ALTER TABLE public.team_invitations
  ADD COLUMN IF NOT EXISTS invitee_mobile text;

ALTER TABLE public.team_invitations
  DROP CONSTRAINT IF EXISTS team_invitations_invitee_mobile_check;
ALTER TABLE public.team_invitations
  ADD CONSTRAINT team_invitations_invitee_mobile_check
  CHECK (invitee_mobile IS NULL OR invitee_mobile ~ '^9[78][0-9]{8}$');

-- Replace the old unbound create signature so no caller can continue issuing phone-unbound links.
DROP FUNCTION IF EXISTS public.create_team_invitation(uuid, uuid, text, text, text[], text, timestamptz, integer, text);

CREATE FUNCTION public.create_team_invitation(
  _business_id uuid, _branch_id uuid, _role text, _job_title text, _denied text[],
  _invitee_mobile text, _token_hash text, _expires_at timestamptz, _max_uses int, _label text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); iid uuid; actor_rank smallint; g public.delegation_grants; p text; cdef text; mobile text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT public.team_invite_authority(actor, _business_id, _branch_id, _role) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  mobile := public.normalize_member_mobile(_invitee_mobile);
  IF mobile IS NULL THEN RAISE EXCEPTION 'Enter a valid Nepal mobile number'; END IF;
  IF _max_uses IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Phone-bound invitations are single-use only'; END IF;
  IF _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid invitation token'; END IF;
  IF _expires_at IS NULL OR _expires_at < now() + interval '5 minutes'
     OR _expires_at > now() + interval '30 days' THEN
    RAISE EXCEPTION 'Expiry must be between 5 minutes and 30 days from now';
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
    (business_id, branch_id, role_code, job_title, denied_permissions, invitee_mobile,
     token_hash, label, invited_by, expires_at, max_uses)
  VALUES (_business_id, _branch_id, _role, _job_title, _denied, mobile,
          _token_hash, _label, actor, _expires_at, 1)
  RETURNING id INTO iid;

  PERFORM public.write_audit(_business_id, 'team_invite.create', 'team_invitations', iid::text, NULL,
    jsonb_build_object('branch', _branch_id, 'role', _role, 'invitee_mobile_last4', right(mobile, 4),
      'max_uses', 1, 'expires_at', _expires_at));
  RETURN iid;
END $$;
REVOKE ALL ON FUNCTION public.create_team_invitation(uuid, uuid, text, text, text[], text, text, timestamptz, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_invitation(uuid, uuid, text, text, text[], text, text, timestamptz, int, text) TO authenticated, service_role;

-- Expose only a masked mobile in the authenticated status view.
CREATE OR REPLACE VIEW public.team_invitations_status WITH (security_invoker = true) AS
SELECT i.id, i.business_id, i.branch_id, i.role_code, i.job_title, i.label, i.invited_by,
  i.expires_at, i.max_uses, i.use_count, i.revoked_at, i.created_at,
  CASE WHEN i.invitee_mobile IS NULL THEN NULL ELSE '••••' || right(i.invitee_mobile, 4) END AS invitee_mobile_masked,
  CASE WHEN i.revoked_at IS NOT NULL THEN 'revoked'
       WHEN i.use_count >= i.max_uses THEN 'accepted'
       WHEN i.expires_at <= now() THEN 'expired'
       WHEN i.use_count > 0 THEN 'partially_used'
       ELSE 'pending' END AS status
FROM public.team_invitations i;
REVOKE ALL ON public.team_invitations_status FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.team_invitations_status TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.preview_team_invitation(text);
CREATE FUNCTION public.preview_team_invitation(_token_hash text)
RETURNS TABLE (
  business_name text, branch_name text, role_name text, job_title text,
  inviter_name text, expires_at timestamptz, seats_left int, invitee_mobile_masked text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.name, br.name, r.name, i.job_title, COALESCE(p.full_name, 'Your manager'),
    i.expires_at, (i.max_uses - i.use_count)::int,
    CASE WHEN i.invitee_mobile IS NULL THEN NULL ELSE '••••' || right(i.invitee_mobile, 4) END
  FROM public.team_invitations i
  JOIN public.businesses b ON b.id = i.business_id
  JOIN public.branches br ON br.id = i.branch_id AND br.business_id = i.business_id
  JOIN public.roles r ON r.code = i.role_code
  LEFT JOIN public.profiles p ON p.id = i.invited_by
  WHERE i.token_hash = _token_hash AND i.invitee_mobile IS NOT NULL
    AND i.revoked_at IS NULL AND i.expires_at > now() AND i.use_count < i.max_uses
$$;
REVOKE ALL ON FUNCTION public.preview_team_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_team_invitation(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_team_invitation(_token_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); i public.team_invitations; au record; mobile text; m public.business_memberships;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT email_confirmed_at, phone_confirmed_at, phone INTO au FROM auth.users WHERE id = actor;
  mobile := public.normalize_member_mobile(au.phone);
  IF au.email_confirmed_at IS NULL OR au.phone_confirmed_at IS NULL OR mobile IS NULL THEN
    RAISE EXCEPTION 'Verify your email and mobile number first' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO i FROM public.team_invitations WHERE token_hash = _token_hash FOR UPDATE;
  IF i.id IS NULL OR i.invitee_mobile IS NULL OR mobile IS DISTINCT FROM i.invitee_mobile
     OR i.revoked_at IS NOT NULL OR i.expires_at <= now()
     OR i.use_count >= i.max_uses OR i.invited_by = actor THEN
    RAISE EXCEPTION 'Invitation unavailable for this account' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.team_invitation_uses WHERE invitation_id = i.id AND user_id = actor) THEN
    RAISE EXCEPTION 'Invitation unavailable for this account' USING ERRCODE = '42501';
  END IF;

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
REVOKE ALL ON FUNCTION public.accept_team_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_team_invitation(text) TO authenticated, service_role;
