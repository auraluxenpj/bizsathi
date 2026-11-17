-- 0071: centralise position permissions and keep branch access independent.
-- Existing auth users, business memberships and branch memberships are retained.
-- Position defaults are read from job_title_denials; business overrides live separately.
-- Apply on a schema-current staging project first. Do not replay against a lagging schema.

CREATE TABLE IF NOT EXISTS public.business_role_templates (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  job_title text NOT NULL CHECK (job_title IN ('partner','manager','branch_manager','accountant','sales_person','stock_manager','entry_person')),
  denied_permissions text[] NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, job_title),
  CHECK (cardinality(denied_permissions) <= 80)
);
REVOKE ALL ON public.business_role_templates FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.business_role_templates TO service_role;
ALTER TABLE public.business_role_templates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_role_templates(_business uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF COALESCE(public.business_role_rank(_business, auth.uid()), 0) < 80 THEN
    RAISE EXCEPTION 'Administrator access is required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_object_agg(x.job_title, jsonb_build_object(
    'customized', x.customized,
    'denied', to_jsonb(x.denied_permissions)
  )), '{}'::jsonb)
  INTO result
  FROM (
    SELECT titles.job_title,
      (t.business_id IS NOT NULL) AS customized,
      CASE WHEN t.business_id IS NOT NULL THEN t.denied_permissions
           ELSE ARRAY(SELECT d.permission FROM public.job_title_denials d WHERE d.job_title = titles.job_title ORDER BY d.permission)
      END AS denied_permissions
    FROM (SELECT DISTINCT job_title FROM public.job_title_denials) titles
    LEFT JOIN public.business_role_templates t
      ON t.business_id = _business AND t.job_title = titles.job_title
  ) x;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_role_templates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_role_templates(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_role_template(_business uuid, _title text, _denied text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_denied text[] := ARRAY(SELECT DISTINCT p FROM unnest(COALESCE(_denied, '{}')) p ORDER BY p);
  cdef text;
BEGIN
  IF COALESCE(public.business_role_rank(_business, auth.uid()), 0) < 100 THEN
    RAISE EXCEPTION 'Only the business owner can change position permissions' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.job_title_denials WHERE job_title = _title) THEN
    RAISE EXCEPTION 'Unknown position';
  END IF;
  IF cardinality(v_denied) > 80 THEN RAISE EXCEPTION 'Too many permission restrictions'; END IF;

  SELECT pg_get_constraintdef(oid) INTO cdef
  FROM pg_constraint
  WHERE conname = 'member_permission_denials_permission_check'
    AND conrelid = 'public.member_permission_denials'::regclass;
  IF cdef IS NULL OR EXISTS (
    SELECT 1 FROM unnest(v_denied) p
    WHERE position(quote_literal(p) IN cdef) = 0
  ) THEN
    RAISE EXCEPTION 'Unknown permission in position template';
  END IF;

  -- Branch Manager's branch-only permission ceiling is immutable; owners may only
  -- add restrictions, never remove a database-defined restriction from its template.
  IF _title = 'branch_manager' AND EXISTS (
    SELECT 1 FROM public.job_title_denials d
    WHERE d.job_title = 'branch_manager' AND NOT (d.permission = ANY(v_denied))
  ) THEN
    RAISE EXCEPTION 'Branch Manager permissions cannot exceed the fixed branch-only ceiling' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.business_role_templates (business_id, job_title, denied_permissions, updated_by, updated_at)
  VALUES (_business, _title, v_denied, auth.uid(), now())
  ON CONFLICT (business_id, job_title) DO UPDATE
    SET denied_permissions = EXCLUDED.denied_permissions,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

  PERFORM public.write_audit(_business, 'position_permissions.update', 'business_role_templates', _title,
    NULL, jsonb_build_object('denied_permissions', to_jsonb(v_denied)));
END;
$$;
REVOKE ALL ON FUNCTION public.set_role_template(uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_role_template(uuid, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_role_template(_business uuid, _title text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.business_role_rank(_business, auth.uid()), 0) < 100 THEN
    RAISE EXCEPTION 'Only the business owner can reset position permissions' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.job_title_denials WHERE job_title = _title) THEN
    RAISE EXCEPTION 'Unknown position';
  END IF;
  DELETE FROM public.business_role_templates WHERE business_id = _business AND job_title = _title;
  PERFORM public.write_audit(_business, 'position_permissions.reset', 'business_role_templates', _title, NULL, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.reset_role_template(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_role_template(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.member_role_denials(_business uuid)
RETURNS TABLE(user_id uuid, permission text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.business_role_rank(_business, auth.uid()), 0) < 80 THEN
    RAISE EXCEPTION 'Administrator access is required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.user_id, denied.permission
  FROM public.business_memberships m
  LEFT JOIN public.business_role_templates t
    ON t.business_id = m.business_id AND t.job_title = m.job_title
  CROSS JOIN LATERAL unnest(
    CASE WHEN t.business_id IS NOT NULL THEN t.denied_permissions
         ELSE ARRAY(SELECT d.permission FROM public.job_title_denials d WHERE d.job_title = m.job_title)
    END
  ) AS denied(permission)
  WHERE m.business_id = _business AND m.status = 'active' AND m.job_title IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.member_role_denials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_role_denials(uuid) TO authenticated;

-- Changing an employee's position must not erase personal restrictions. Position
-- restrictions are now returned by member_role_denials and are no longer copied
-- into member_permission_denials.
CREATE OR REPLACE FUNCTION public.set_member_job_title(_business uuid, _user uuid, _title text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE st text;
BEGIN
  IF public.job_title_role(_title) IS NULL THEN RAISE EXCEPTION 'Unknown position'; END IF;
  SELECT status INTO st
  FROM public.business_memberships
  WHERE business_id = _business AND user_id = _user
  FOR UPDATE;
  IF st IS NULL THEN RAISE EXCEPTION 'Employee not found'; END IF;

  PERFORM public.update_business_member(_business, _user, public.job_title_role(_title), st);
  UPDATE public.business_memberships SET job_title = _title
  WHERE business_id = _business AND user_id = _user;
  PERFORM public.write_audit(_business, 'job_title.update', 'business_memberships', _user::text,
    NULL, jsonb_build_object('title', _title));
END;
$$;
REVOKE ALL ON FUNCTION public.set_member_job_title(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_job_title(uuid, uuid, text) TO authenticated;

-- Legacy business-invitation trigger: set the position only; do not duplicate the
-- position's current default restrictions as personal employee restrictions.
CREATE OR REPLACE FUNCTION public.apply_invited_job_title()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t text;
BEGIN
  SELECT i.job_title INTO t
  FROM public.business_invitations i
  JOIN auth.users u ON lower(u.email) = i.email
  WHERE i.business_id = NEW.business_id AND u.id = NEW.user_id
    AND i.job_title IS NOT NULL AND i.accepted_at IS NULL AND i.revoked_at IS NULL
    AND i.role_code = NEW.role_code
  ORDER BY i.expires_at DESC LIMIT 1;
  IF t IS NULL THEN RETURN NEW; END IF;
  UPDATE public.business_memberships SET job_title = t
  WHERE business_id = NEW.business_id AND user_id = NEW.user_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_invited_job_title() FROM PUBLIC, anon, authenticated;

-- Team invitation acceptance: preserve invitation-specific restrictions only.
-- Position restrictions are inherited dynamically from business_role_templates.
CREATE OR REPLACE FUNCTION public.accept_team_invitation(_token_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  i public.team_invitations;
  au record;
  mobile text;
  m public.business_memberships;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT email, email_confirmed_at, phone_confirmed_at, phone INTO au FROM auth.users WHERE id = actor;
  mobile := public.normalize_member_mobile(au.phone);
  IF au.email_confirmed_at IS NULL OR au.phone_confirmed_at IS NULL OR mobile IS NULL THEN
    RAISE EXCEPTION 'Verify your email and mobile number first' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO i FROM public.team_invitations WHERE token_hash = _token_hash FOR UPDATE;
  IF i.id IS NULL OR i.invitee_email IS NULL OR lower(au.email) IS DISTINCT FROM i.invitee_email OR i.invitee_mobile IS NULL OR mobile IS DISTINCT FROM i.invitee_mobile
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

    -- Do not copy job_title_denials here. Store only restrictions explicitly
    -- carried by the invitation; the employee's position template is separate.
    INSERT INTO public.member_permission_denials (business_id, user_id, permission, granted_by)
    SELECT i.business_id, actor, p.permission, i.invited_by
    FROM unnest(COALESCE(i.denied_permissions, '{}')) AS p(permission)
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
    jsonb_build_object('branch', i.branch_id, 'position', i.job_title));
  RETURN i.business_id;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_team_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_team_invitation(text) TO authenticated;

COMMENT ON TABLE public.business_role_templates IS
  'Business-specific position permission templates. Branch membership is managed independently.';
COMMENT ON FUNCTION public.member_role_denials(uuid) IS
  'Returns effective position-level permission denials; member-specific denials remain separate.';
