-- 0072: use the inviter's effective business-specific position template when creating invitations.
-- This preserves delegated permission ceilings without reverting customised positions to global defaults.

CREATE OR REPLACE FUNCTION public.create_team_invitation(
  _business_id uuid,
  _branch_id uuid,
  _role text,
  _job_title text,
  _denied text[],
  _invitee_email text,
  _invitee_mobile text,
  _token_hash text,
  _expires_at timestamp with time zone,
  _max_uses integer,
  _label text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.team_invite_authority(actor, _business_id, _branch_id, _role) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  invited_email := lower(trim(_invitee_email));
  IF invited_email IS NULL OR length(invited_email) > 254
     OR invited_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid invitee email address';
  END IF;
  mobile := public.normalize_member_mobile(_invitee_mobile);
  IF mobile IS NULL THEN RAISE EXCEPTION 'Enter a valid Nepal mobile number'; END IF;
  IF _max_uses IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Phone-bound invitations are single-use only'; END IF;
  IF _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid invitation token';
  END IF;
  IF _expires_at IS NULL OR _expires_at < now() + interval '5 minutes'
     OR _expires_at > now() + interval '30 days' THEN
    RAISE EXCEPTION 'Expiry must be between 5 minutes and 30 days from now';
  END IF;
  IF _job_title IS NOT NULL AND public.job_title_role(_job_title) IS DISTINCT FROM _role THEN
    RAISE EXCEPTION 'Position does not match the underlying security role';
  END IF;
  IF _role = 'branch_manager' AND _job_title IS DISTINCT FROM 'branch_manager' THEN
    RAISE EXCEPTION 'Branch Manager invitations must use the Branch Manager position';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.business_id = _business_id AND m.user_id = actor
      AND m.status = 'active' AND m.role_code = 'branch_manager'
      AND m.job_title IS DISTINCT FROM 'branch_manager'
  ) THEN
    RAISE EXCEPTION 'Branch Manager assignment is incomplete';
  END IF;

  _denied := COALESCE(_denied, '{}');
  -- The invitee cannot receive permissions denied to the inviter. Use the inviter's
  -- current business-specific position template, not the global position defaults.
  SELECT COALESCE(array_agg(permission ORDER BY permission), ARRAY[]::text[])
  INTO _denied
  FROM (
    SELECT unnest(_denied) AS permission
    UNION
    SELECT d.permission
    FROM public.member_permission_denials d
    WHERE d.business_id = _business_id AND d.user_id = actor
    UNION
    SELECT effective_denial.permission
    FROM public.business_memberships m
    LEFT JOIN public.business_role_templates t
      ON t.business_id = m.business_id AND t.job_title = m.job_title
    CROSS JOIN LATERAL unnest(
      CASE WHEN t.business_id IS NOT NULL THEN t.denied_permissions
           ELSE ARRAY(SELECT jd.permission FROM public.job_title_denials jd WHERE jd.job_title = m.job_title)
      END
    ) AS effective_denial(permission)
    WHERE m.business_id = _business_id AND m.user_id = actor AND m.status = 'active'
  ) effective_denials;

  IF cardinality(_denied) > 80 THEN
    RAISE EXCEPTION 'Too many permission restrictions';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO cdef
  FROM pg_constraint
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
      SELECT * INTO g
      FROM public.delegation_grants
      WHERE business_id = _business_id AND branch_id = _branch_id
        AND manager_user_id = actor AND revoked_at IS NULL
        AND can_invite AND _role = ANY (allowed_role_codes)
      FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Delegation is no longer active' USING ERRCODE = '42501'; END IF;
      IF _max_uses > g.max_invite_uses
         OR _expires_at > now() + make_interval(days => g.max_invite_days) THEN
        RAISE EXCEPTION 'Exceeds your delegation limits' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.team_invitations
    (business_id, branch_id, role_code, job_title, denied_permissions, invitee_email, invitee_mobile,
     token_hash, label, invited_by, expires_at, max_uses)
  VALUES (_business_id, _branch_id, _role, _job_title, _denied, invited_email, mobile,
          _token_hash, _label, actor, _expires_at, 1)
  RETURNING id INTO iid;

  PERFORM public.write_audit(_business_id, 'team_invite.create', 'team_invitations', iid::text, NULL,
    jsonb_build_object('branch', _branch_id, 'position', _job_title,
      'invitee_email_domain', split_part(invited_email, '@', 2),
      'invitee_mobile_last4', right(mobile, 4), 'max_uses', 1, 'expires_at', _expires_at));
  RETURN iid;
END
$$;

REVOKE ALL ON FUNCTION public.create_team_invitation(uuid,uuid,text,text,text[],text,text,text,timestamptz,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_invitation(uuid,uuid,text,text,text[],text,text,text,timestamptz,integer,text) TO authenticated;

COMMENT ON FUNCTION public.create_team_invitation(uuid,uuid,text,text,text[],text,text,text,timestamptz,integer,text) IS
  'Creates a branch-locked invitation while inheriting the inviter''s effective business-specific position restrictions.';
