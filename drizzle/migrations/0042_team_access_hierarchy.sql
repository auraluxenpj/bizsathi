-- 0042: Platform master owner, branch delegation, multi-use team invitations.
-- ADDITIVE. Keeps the existing roles / business_memberships / branch_memberships / business_invitations
-- paths working. Does not touch sales, stock, finance, loyalty or customer data.
-- Needs 0000, 0003, 0018 (normalize_member_mobile), 0029/0030 (denials), 0040 (job titles).
-- NOT applied to production by this file alone: review, run on staging first, then production.

-- ============ 1. PLATFORM MASTER OWNER ============
-- Bound to the immutable auth.users UUID. No API role can read or write this table.
CREATE TABLE IF NOT EXISTS public.platform_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  note text CHECK (char_length(note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.platform_owners FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_owners TO service_role;
ALTER TABLE public.platform_owners ENABLE ROW LEVEL SECURITY;  -- no policies = no API access

-- Only the SQL editor / migrations (no JWT user) may change this table.
CREATE OR REPLACE FUNCTION public.guard_platform_owners() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Platform owner records cannot be changed from the app' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.guard_platform_owners() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_platform_owners ON public.platform_owners;
CREATE TRIGGER guard_platform_owners BEFORE INSERT OR UPDATE OR DELETE ON public.platform_owners FOR EACH ROW EXECUTE FUNCTION public.guard_platform_owners();

-- Internal check (any user id). Not callable by API roles, so nobody can probe who the owner is.
CREATE OR REPLACE FUNCTION public.platform_owner_check(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.platform_owners WHERE user_id = _user_id AND is_active)
$$;
REVOKE ALL ON FUNCTION public.platform_owner_check(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_check(uuid) TO service_role;

-- Caller-only check for the UI and RLS.
CREATE OR REPLACE FUNCTION public.is_platform_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.platform_owner_check(auth.uid())
$$;
REVOKE ALL ON FUNCTION public.is_platform_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated, service_role;

-- The master owner is treated as rank 100 in every active business, so every existing
-- is_business_member / has_business_role / can_access_branch policy already grants access.
-- Same signature and return type as the 0000 definition.
CREATE OR REPLACE FUNCTION public.business_role_rank(_business_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS smallint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.platform_owner_check(_user_id) THEN
      (SELECT 100::smallint FROM public.businesses b WHERE b.id = _business_id AND b.archived_at IS NULL)
    ELSE
      (SELECT r.rank FROM public.business_memberships m
         JOIN public.roles r ON r.code = m.role_code
         JOIN public.businesses b ON b.id = m.business_id
        WHERE m.business_id = _business_id AND m.user_id = _user_id
          AND m.status = 'active' AND b.archived_at IS NULL AND _user_id IS NOT NULL)
  END
$$;

-- The master owner's membership / branch rows cannot be demoted, suspended, moved or removed through the app.
CREATE OR REPLACE FUNCTION public.protect_platform_owner_rows() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.platform_owner_check(OLD.user_id) THEN
    IF TG_OP = 'DELETE'
       OR (TG_TABLE_NAME = 'business_memberships' AND (NEW.role_code IS DISTINCT FROM OLD.role_code OR NEW.status IS DISTINCT FROM OLD.status OR NEW.business_id IS DISTINCT FROM OLD.business_id OR NEW.user_id IS DISTINCT FROM OLD.user_id)) THEN
      RAISE EXCEPTION 'The platform master owner cannot be changed or removed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.protect_platform_owner_rows() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_platform_owner_bm ON public.business_memberships;
CREATE TRIGGER protect_platform_owner_bm BEFORE UPDATE OR DELETE ON public.business_memberships FOR EACH ROW EXECUTE FUNCTION public.protect_platform_owner_rows();
DROP TRIGGER IF EXISTS protect_platform_owner_brm ON public.branch_memberships;
CREATE TRIGGER protect_platform_owner_brm BEFORE DELETE ON public.branch_memberships FOR EACH ROW EXECUTE FUNCTION public.protect_platform_owner_rows();

-- Master owner can read every audit record (existing policy still covers business admins).
DROP POLICY IF EXISTS audit_select_platform_owner ON public.audit_logs;
CREATE POLICY audit_select_platform_owner ON public.audit_logs FOR SELECT TO authenticated USING (public.is_platform_owner());

-- ============ 2. BRANCH DELEGATION GRANTS ============
CREATE TABLE IF NOT EXISTS public.delegation_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  manager_user_id uuid NOT NULL,
  allowed_role_codes text[] NOT NULL CHECK (cardinality(allowed_role_codes) BETWEEN 1 AND 10 AND NOT ('owner' = ANY (allowed_role_codes))),
  can_invite boolean NOT NULL DEFAULT true,
  max_invite_uses smallint NOT NULL DEFAULT 25 CHECK (max_invite_uses BETWEEN 1 AND 100),
  max_invite_days smallint NOT NULL DEFAULT 14 CHECK (max_invite_days BETWEEN 1 AND 30),
  granted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, manager_user_id) REFERENCES public.business_memberships(business_id, user_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS delegation_one_active ON public.delegation_grants (business_id, branch_id, manager_user_id) WHERE revoked_at IS NULL;
REVOKE ALL ON public.delegation_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.delegation_grants TO authenticated;
GRANT ALL ON public.delegation_grants TO service_role;
ALTER TABLE public.delegation_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY delegation_read ON public.delegation_grants FOR SELECT TO authenticated
  USING (public.has_business_role(business_id, 'admin') OR manager_user_id = auth.uid());

-- ============ 3. TEAM INVITATIONS (multi-use, branch scoped) ============
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  role_code text NOT NULL REFERENCES public.roles(code) ON DELETE RESTRICT CHECK (role_code <> 'owner'),
  job_title text CHECK (job_title IS NULL OR job_title IN ('partner','manager','accountant','sales_person','stock_manager','entry_person')),
  denied_permissions text[] NOT NULL DEFAULT '{}' CHECK (cardinality(denied_permissions) <= 80),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  label text CHECK (char_length(label) <= 120),
  invited_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  max_uses smallint NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 100),
  use_count smallint NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_inv_use_count CHECK (use_count >= 0 AND use_count <= max_uses),
  CONSTRAINT team_inv_expiry CHECK (expires_at > created_at),
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS team_invitations_business_idx ON public.team_invitations (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS team_invitations_inviter_idx ON public.team_invitations (invited_by, created_at DESC);

CREATE TABLE IF NOT EXISTS public.team_invitation_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.team_invitations(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  email_verified_at timestamptz NOT NULL,
  phone_verified_at timestamptz NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invitation_id, user_id)
);

REVOKE ALL ON public.team_invitations, public.team_invitation_uses FROM PUBLIC, anon, authenticated;
-- token_hash is never readable by API roles.
GRANT SELECT (id, business_id, branch_id, role_code, job_title, denied_permissions, label, invited_by, expires_at, max_uses, use_count, revoked_at, revoked_by, created_at)
  ON public.team_invitations TO authenticated;
GRANT SELECT ON public.team_invitation_uses TO authenticated;
GRANT ALL ON public.team_invitations, public.team_invitation_uses TO service_role;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitation_uses ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_invitations_read ON public.team_invitations FOR SELECT TO authenticated
  USING (public.has_business_role(business_id, 'admin') OR invited_by = auth.uid());
CREATE POLICY team_invitation_uses_read ON public.team_invitation_uses FOR SELECT TO authenticated
  USING (public.has_business_role(business_id, 'admin') OR EXISTS (SELECT 1 FROM public.team_invitations i WHERE i.id = invitation_id AND i.invited_by = auth.uid()));

-- Status for the UI: Pending / Partially Used / Accepted / Expired / Revoked.
CREATE OR REPLACE VIEW public.team_invitations_status WITH (security_invoker = true) AS
SELECT i.id, i.business_id, i.branch_id, i.role_code, i.job_title, i.label, i.invited_by, i.expires_at, i.max_uses, i.use_count, i.revoked_at, i.created_at,
  CASE WHEN i.revoked_at IS NOT NULL THEN 'revoked'
       WHEN i.use_count >= i.max_uses THEN 'accepted'
       WHEN i.expires_at <= now() THEN 'expired'
       WHEN i.use_count > 0 THEN 'partially_used'
       ELSE 'pending' END AS status
FROM public.team_invitations i;
REVOKE ALL ON public.team_invitations_status FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.team_invitations_status TO authenticated;
GRANT ALL ON public.team_invitations_status TO service_role;

-- ============ 4. AUTHORITY CHECK (single source of truth) ============
-- Can _actor currently invite _role into this branch? Used both when creating and when accepting.
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
  -- Branch manager: needs an active delegation grant for this exact branch, branch access, and a non-admin target role.
  RETURN target_rank < 80
    AND EXISTS (SELECT 1 FROM public.delegation_grants g
                 WHERE g.business_id = _business_id AND g.branch_id = _branch_id AND g.manager_user_id = _actor
                   AND g.revoked_at IS NULL AND g.can_invite AND _role = ANY (g.allowed_role_codes))
    AND EXISTS (SELECT 1 FROM public.branch_memberships bm WHERE bm.business_id = _business_id AND bm.branch_id = _branch_id AND bm.user_id = _actor);
END $$;
REVOKE ALL ON FUNCTION public.team_invite_authority(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.team_invite_authority(uuid, uuid, uuid, text) TO service_role;

-- ============ 5. DELEGATION RPCs ============
CREATE OR REPLACE FUNCTION public.grant_branch_delegation(_business_id uuid, _branch_id uuid, _manager uuid, _roles text[], _max_uses int DEFAULT 25, _max_days int DEFAULT 14)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); actor_rank smallint; mgr_rank smallint; gid uuid; r text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  actor_rank := public.business_role_rank(_business_id, actor);
  IF actor_rank IS NULL OR actor_rank < 80 THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF _manager = actor THEN RAISE EXCEPTION 'You cannot delegate authority to yourself' USING ERRCODE = '42501'; END IF;
  mgr_rank := public.business_role_rank(_business_id, _manager);
  IF mgr_rank IS NULL OR mgr_rank >= actor_rank OR public.platform_owner_check(_manager) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branch_memberships WHERE business_id = _business_id AND branch_id = _branch_id AND user_id = _manager) THEN
    RAISE EXCEPTION 'Give the manager access to this branch first';
  END IF;
  IF _roles IS NULL OR cardinality(_roles) NOT BETWEEN 1 AND 10 OR _max_uses NOT BETWEEN 1 AND 100 OR _max_days NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Invalid delegation settings'; END IF;
  FOREACH r IN ARRAY _roles LOOP
    IF NOT EXISTS (SELECT 1 FROM public.roles WHERE code = r AND rank < 80) THEN RAISE EXCEPTION 'Role % cannot be delegated', r USING ERRCODE = '42501'; END IF;
  END LOOP;
  UPDATE public.delegation_grants SET revoked_at = now(), revoked_by = actor
   WHERE business_id = _business_id AND branch_id = _branch_id AND manager_user_id = _manager AND revoked_at IS NULL;
  INSERT INTO public.delegation_grants (business_id, branch_id, manager_user_id, allowed_role_codes, max_invite_uses, max_invite_days, granted_by)
  VALUES (_business_id, _branch_id, _manager, _roles, _max_uses, _max_days, actor) RETURNING id INTO gid;
  PERFORM public.write_audit(_business_id, 'delegation.grant', 'delegation_grants', gid::text, NULL, jsonb_build_object('manager', _manager, 'branch', _branch_id, 'roles', _roles));
  RETURN gid;
END $$;
REVOKE ALL ON FUNCTION public.grant_branch_delegation(uuid, uuid, uuid, text[], int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_branch_delegation(uuid, uuid, uuid, text[], int, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoke_branch_delegation(_grant_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.delegation_grants; actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO g FROM public.delegation_grants WHERE id = _grant_id FOR UPDATE;
  IF g.id IS NULL OR COALESCE(public.business_role_rank(g.business_id, actor), 0) < 80 THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  UPDATE public.delegation_grants SET revoked_at = now(), revoked_by = actor WHERE id = _grant_id AND revoked_at IS NULL;
  PERFORM public.write_audit(g.business_id, 'delegation.revoke', 'delegation_grants', _grant_id::text, NULL, jsonb_build_object('manager', g.manager_user_id));
END $$;
REVOKE ALL ON FUNCTION public.revoke_branch_delegation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_branch_delegation(uuid) TO authenticated, service_role;

-- ============ 6. INVITATION RPCs ============
-- The server function generates a random token, hashes it (SHA-256 hex) and passes only the hash here.
CREATE OR REPLACE FUNCTION public.create_team_invitation(
  _business_id uuid, _branch_id uuid, _role text, _job_title text, _denied text[],
  _token_hash text, _expires_at timestamptz, _max_uses int, _label text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); iid uuid; actor_rank smallint; g public.delegation_grants; p text; cdef text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT public.team_invite_authority(actor, _business_id, _branch_id, _role) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid invitation token'; END IF;
  IF _expires_at IS NULL OR _expires_at < now() + interval '5 minutes' OR _expires_at > now() + interval '30 days' THEN RAISE EXCEPTION 'Expiry must be between 5 minutes and 30 days from now'; END IF;
  IF _max_uses IS NULL OR _max_uses < 1 OR _max_uses > 100 THEN RAISE EXCEPTION 'Maximum registrations must be between 1 and 100'; END IF;
  IF _job_title IS NOT NULL AND public.job_title_role(_job_title) IS DISTINCT FROM _role THEN RAISE EXCEPTION 'Job title does not match the role'; END IF;
  _denied := COALESCE(_denied, '{}');
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint WHERE conname = 'member_permission_denials_permission_check' AND conrelid = 'public.member_permission_denials'::regclass;
  FOREACH p IN ARRAY _denied LOOP
    IF cdef IS NULL OR position(quote_literal(p) IN cdef) = 0 THEN RAISE EXCEPTION 'Unknown permission %', p; END IF;
  END LOOP;
  IF NOT public.platform_owner_check(actor) THEN
    actor_rank := public.business_role_rank(_business_id, actor);
    IF actor_rank < 80 THEN
      SELECT * INTO g FROM public.delegation_grants WHERE business_id = _business_id AND branch_id = _branch_id AND manager_user_id = actor AND revoked_at IS NULL;
      IF _max_uses > g.max_invite_uses OR _expires_at > now() + make_interval(days => g.max_invite_days) THEN RAISE EXCEPTION 'Exceeds your delegation limits' USING ERRCODE = '42501'; END IF;
      -- A delegate cannot hand out more permissions than they hold themselves.
      IF EXISTS (SELECT 1 FROM public.member_permission_denials d WHERE d.business_id = _business_id AND d.user_id = actor AND NOT (d.permission = ANY (_denied))) THEN
        RAISE EXCEPTION 'You cannot grant permissions you do not have' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  INSERT INTO public.team_invitations (business_id, branch_id, role_code, job_title, denied_permissions, token_hash, label, invited_by, expires_at, max_uses)
  VALUES (_business_id, _branch_id, _role, _job_title, _denied, _token_hash, _label, actor, _expires_at, _max_uses) RETURNING id INTO iid;
  PERFORM public.write_audit(_business_id, 'team_invite.create', 'team_invitations', iid::text, NULL,
    jsonb_build_object('branch', _branch_id, 'role', _role, 'max_uses', _max_uses, 'expires_at', _expires_at));
  RETURN iid;
END $$;
REVOKE ALL ON FUNCTION public.create_team_invitation(uuid, uuid, text, text, text[], text, timestamptz, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_invitation(uuid, uuid, text, text, text[], text, timestamptz, int, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoke_team_invitation(_invitation_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.team_invitations; actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO i FROM public.team_invitations WHERE id = _invitation_id FOR UPDATE;
  IF i.id IS NULL OR NOT (i.invited_by = actor OR COALESCE(public.business_role_rank(i.business_id, actor), 0) >= 80) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF i.revoked_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.team_invitations SET revoked_at = now(), revoked_by = actor WHERE id = i.id;
  PERFORM public.write_audit(i.business_id, 'team_invite.revoke', 'team_invitations', i.id::text, NULL, NULL);
END $$;
REVOKE ALL ON FUNCTION public.revoke_team_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_team_invitation(uuid) TO authenticated, service_role;

-- Preview for the signup page (business, branch, role, inviter, validity). Public-safe: no ids, no hash.
-- Returns nothing for unknown / expired / revoked / exhausted tokens (same empty result for all).
CREATE OR REPLACE FUNCTION public.preview_team_invitation(_token_hash text)
RETURNS TABLE (business_name text, branch_name text, role_name text, job_title text, inviter_name text, expires_at timestamptz, seats_left int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.name, br.name, r.name, i.job_title, COALESCE(p.full_name, 'Your manager'), i.expires_at, (i.max_uses - i.use_count)::int
  FROM public.team_invitations i
  JOIN public.businesses b ON b.id = i.business_id
  JOIN public.branches br ON br.id = i.branch_id AND br.business_id = i.business_id
  JOIN public.roles r ON r.code = i.role_code
  LEFT JOIN public.profiles p ON p.id = i.invited_by
  WHERE i.token_hash = _token_hash AND i.revoked_at IS NULL AND i.expires_at > now() AND i.use_count < i.max_uses
$$;
REVOKE ALL ON FUNCTION public.preview_team_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_team_invitation(text) TO anon, authenticated, service_role;

-- Atomic acceptance. Requires BOTH email and mobile verified by Supabase Auth (auth.users confirmations).
CREATE OR REPLACE FUNCTION public.accept_team_invitation(_token_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); i public.team_invitations; au record; mobile text; m public.business_memberships;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT email_confirmed_at, phone_confirmed_at, phone INTO au FROM auth.users WHERE id = actor;
  mobile := public.normalize_member_mobile(au.phone);
  IF au.email_confirmed_at IS NULL OR au.phone_confirmed_at IS NULL OR mobile IS NULL THEN
    RAISE EXCEPTION 'Verify your email and mobile number first' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO i FROM public.team_invitations WHERE token_hash = _token_hash FOR UPDATE;   -- serialises concurrent acceptances
  IF i.id IS NULL OR i.revoked_at IS NOT NULL OR i.expires_at <= now() OR i.use_count >= i.max_uses OR i.invited_by = actor THEN
    RAISE EXCEPTION 'Invitation unavailable for this account' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.team_invitation_uses WHERE invitation_id = i.id AND user_id = actor) THEN
    RAISE EXCEPTION 'Invitation unavailable for this account' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.business_memberships WHERE business_id = i.business_id AND user_id = i.invited_by FOR SHARE;
  IF NOT public.team_invite_authority(i.invited_by, i.business_id, i.branch_id, i.role_code) THEN
    RAISE EXCEPTION 'Invitation no longer authorized' USING ERRCODE = '42501';
  END IF;
  -- Link the verified mobile to the profile (unique per mobile, enforced by profiles_mobile_unique).
  BEGIN
    UPDATE public.profiles SET phone = mobile WHERE id = actor AND phone IS DISTINCT FROM mobile;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This mobile number is already registered' USING ERRCODE = '42501';
  END;
  SELECT * INTO m FROM public.business_memberships WHERE business_id = i.business_id AND user_id = actor FOR UPDATE;
  IF m.id IS NULL THEN
    INSERT INTO public.business_memberships (business_id, user_id, role_code, job_title, invited_by) VALUES (i.business_id, actor, i.role_code, i.job_title, i.invited_by);
    -- Job-title defaults first, then the extra restrictions chosen on the invitation.
    INSERT INTO public.member_permission_denials (business_id, user_id, permission, granted_by)
      SELECT i.business_id, actor, d.permission, i.invited_by FROM public.job_title_denials d WHERE i.job_title IS NOT NULL AND d.job_title = i.job_title
      UNION SELECT i.business_id, actor, unnest(i.denied_permissions), i.invited_by
      ON CONFLICT DO NOTHING;
  ELSIF m.status <> 'active' THEN
    RAISE EXCEPTION 'Invitation unavailable for this account' USING ERRCODE = '42501';
  END IF;   -- an existing member keeps their current role and permissions; only branch access is added
  INSERT INTO public.branch_memberships (business_id, branch_id, user_id, granted_by) VALUES (i.business_id, i.branch_id, actor, i.invited_by) ON CONFLICT DO NOTHING;
  INSERT INTO public.team_invitation_uses (invitation_id, business_id, user_id, email_verified_at, phone_verified_at) VALUES (i.id, i.business_id, actor, au.email_confirmed_at, au.phone_confirmed_at);
  UPDATE public.team_invitations SET use_count = use_count + 1 WHERE id = i.id;
  PERFORM public.write_audit(i.business_id, 'team_invite.accept', 'team_invitations', i.id::text, NULL, jsonb_build_object('branch', i.branch_id, 'role', i.role_code));
  RETURN i.business_id;
END $$;
REVOKE ALL ON FUNCTION public.accept_team_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_team_invitation(text) TO authenticated, service_role;
