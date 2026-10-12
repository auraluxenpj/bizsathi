-- BizSathi Nepal: tenancy & security foundation
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ROLES (trusted catalog; rank decides authority)
CREATE TABLE public.roles (
  code text PRIMARY KEY CHECK (code ~ '^[a-z_]+$'),
  name text NOT NULL,
  rank smallint NOT NULL UNIQUE CHECK (rank BETWEEN 1 AND 100),
  description text
);
GRANT SELECT ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_read ON public.roles FOR SELECT TO authenticated USING (true);
INSERT INTO public.roles(code,name,rank,description) VALUES
 ('owner','Owner',100,'Full control, one per business'),
 ('admin','Administrator',80,'Manage members (below admin), branches, settings'),
 ('accountant','Accountant',60,'Manage financial periods'),
 ('staff','Staff',40,'Operational access'),
 ('viewer','Viewer',20,'Read-only access');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text CHECK (char_length(full_name) <= 200),
  phone text CHECK (char_length(phone) <= 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- BUSINESSES
CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  legal_name text CHECK (char_length(legal_name) <= 300),
  pan_vat_number text CHECK (pan_vat_number ~ '^[0-9]{9}$'),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX businesses_pan_vat_uniq ON public.businesses(pan_vat_number) WHERE pan_vat_number IS NOT NULL;
CREATE INDEX businesses_created_by_idx ON public.businesses(created_by);
GRANT SELECT ON public.businesses TO authenticated;
GRANT UPDATE (name, legal_name, pan_vat_number) ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- MEMBERSHIPS (writes only via SECURITY DEFINER functions)
CREATE TABLE public.business_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  role_code text NOT NULL REFERENCES public.roles(code) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);
CREATE UNIQUE INDEX one_owner_per_business ON public.business_memberships(business_id) WHERE role_code = 'owner';
CREATE INDEX memberships_user_idx ON public.business_memberships(user_id, status);
GRANT SELECT ON public.business_memberships TO authenticated;
GRANT ALL ON public.business_memberships TO service_role;
ALTER TABLE public.business_memberships ENABLE ROW LEVEL SECURITY;

-- BRANCHES
CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  address text CHECK (char_length(address) <= 500),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, code),
  UNIQUE (business_id, id)
);
GRANT SELECT, INSERT ON public.branches TO authenticated;
GRANT UPDATE (code, name, address, is_active) ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- FINANCIAL PERIODS
CREATE TABLE public.financial_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','locked')),
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  UNIQUE (business_id, name),
  UNIQUE (business_id, id),
  EXCLUDE USING gist (business_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
);
CREATE INDEX financial_periods_business_dates_idx ON public.financial_periods(business_id, start_date);
GRANT SELECT, INSERT ON public.financial_periods TO authenticated;
GRANT UPDATE (name, start_date, end_date) ON public.financial_periods TO authenticated;
GRANT ALL ON public.financial_periods TO service_role;
ALTER TABLE public.financial_periods ENABLE ROW LEVEL SECURITY;

-- BUSINESS SETTINGS
CREATE TABLE public.business_settings (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE RESTRICT,
  currency text NOT NULL DEFAULT 'NPR' CHECK (currency ~ '^[A-Z]{3}$'),
  calendar_system text NOT NULL DEFAULT 'BS' CHECK (calendar_system IN ('BS','AD')),
  fiscal_year_start_month smallint NOT NULL DEFAULT 4 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  vat_registered boolean NOT NULL DEFAULT false,
  vat_rate numeric(5,2) NOT NULL DEFAULT 13.00 CHECK (vat_rate BETWEEN 0 AND 100),
  timezone text NOT NULL DEFAULT 'Asia/Kathmandu',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.business_settings TO authenticated;
GRANT UPDATE (currency, calendar_system, fiscal_year_start_month, vat_registered, vat_rate, timezone) ON public.business_settings TO authenticated;
GRANT ALL ON public.business_settings TO service_role;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

-- AUDIT LOGS (append-only)
CREATE TABLE public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT,
  actor_id uuid,
  action text NOT NULL,
  entity_table text NOT NULL,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_business_time_idx ON public.audit_logs(business_id, created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ===== Helper functions (trusted, read DB state, never client input) =====
CREATE OR REPLACE FUNCTION public.business_role_rank(_business_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS smallint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.rank FROM public.business_memberships m
  JOIN public.roles r ON r.code = m.role_code
  JOIN public.businesses b ON b.id = m.business_id
  WHERE m.business_id = _business_id AND m.user_id = _user_id
    AND m.status = 'active' AND b.archived_at IS NULL AND _user_id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.is_business_member(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.business_role_rank(_business_id, auth.uid()), 0) > 0
$$;

CREATE OR REPLACE FUNCTION public.has_business_role(_business_id uuid, _min_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.business_role_rank(_business_id, auth.uid()), 0)
         >= (SELECT rank FROM public.roles WHERE code = _min_role)
$$;

CREATE OR REPLACE FUNCTION public.shares_business_with(_other uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_memberships a
    JOIN public.business_memberships b ON a.business_id = b.business_id
    WHERE a.user_id = auth.uid() AND a.status = 'active' AND b.user_id = _other)
$$;

REVOKE EXECUTE ON FUNCTION public.business_role_rank(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_business_member(uuid), public.has_business_role(uuid,text), public.shares_business_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid), public.has_business_role(uuid,text), public.shares_business_with(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.write_audit(_business_id uuid, _action text, _table text, _entity text, _old jsonb, _new jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.audit_logs(business_id, actor_id, action, entity_table, entity_id, old_data, new_data)
  VALUES (_business_id, auth.uid(), _action, _table, _entity, _old, _new)
$$;
REVOKE EXECUTE ON FUNCTION public.write_audit(uuid,text,text,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;

-- ===== Policies =====
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.shares_business_with(id));
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY businesses_select ON public.businesses FOR SELECT TO authenticated
  USING (public.is_business_member(id));
CREATE POLICY businesses_update ON public.businesses FOR UPDATE TO authenticated
  USING (public.has_business_role(id,'admin')) WITH CHECK (public.has_business_role(id,'admin'));

CREATE POLICY memberships_select ON public.business_memberships FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));

CREATE POLICY branches_select ON public.branches FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
CREATE POLICY branches_insert ON public.branches FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(business_id,'admin'));
CREATE POLICY branches_update ON public.branches FOR UPDATE TO authenticated
  USING (public.has_business_role(business_id,'admin')) WITH CHECK (public.has_business_role(business_id,'admin'));

CREATE POLICY periods_select ON public.financial_periods FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
CREATE POLICY periods_insert ON public.financial_periods FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(business_id,'accountant') AND status = 'open');
CREATE POLICY periods_update ON public.financial_periods FOR UPDATE TO authenticated
  USING (public.has_business_role(business_id,'accountant') AND status = 'open')
  WITH CHECK (public.has_business_role(business_id,'accountant'));

CREATE POLICY settings_select ON public.business_settings FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
CREATE POLICY settings_update ON public.business_settings FOR UPDATE TO authenticated
  USING (public.has_business_role(business_id,'admin')) WITH CHECK (public.has_business_role(business_id,'admin'));

CREATE POLICY audit_select ON public.audit_logs FOR SELECT TO authenticated
  USING (business_id IS NOT NULL AND public.has_business_role(business_id,'admin'));

-- ===== Triggers =====
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.prevent_tenant_change() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'business_id is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.block_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION '% on % is not allowed', TG_OP, TG_TABLE_NAME USING ERRCODE = '42501'; END $$;

CREATE OR REPLACE FUNCTION public.guard_closed_period() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'open' THEN RAISE EXCEPTION 'Closed/locked periods cannot be deleted' USING ERRCODE='42501'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'locked' THEN RAISE EXCEPTION 'Locked period is immutable' USING ERRCODE='42501'; END IF;
  IF OLD.status = 'closed' AND current_setting('bizsathi.period_op', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Closed period can only change through reopen/lock functions' USING ERRCODE='42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND current_setting('bizsathi.period_op', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Period status changes require close_financial_period/lock functions' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; bid uuid; eid text;
BEGIN
  r := COALESCE(NEW, OLD);
  bid := CASE WHEN TG_TABLE_NAME = 'businesses' THEN (to_jsonb(r)->>'id')::uuid ELSE (to_jsonb(r)->>'business_id')::uuid END;
  eid := COALESCE(to_jsonb(r)->>'id', to_jsonb(r)->>'business_id');
  INSERT INTO public.audit_logs(business_id, actor_id, action, entity_table, entity_id, old_data, new_data)
  VALUES (bid, auth.uid(), lower(TG_OP), TG_TABLE_NAME, eid,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE EXECUTE ON FUNCTION public.audit_row(), public.touch_updated_at(), public.prevent_tenant_change(), public.block_mutation(), public.guard_closed_period() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER t_profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_businesses_touch BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_memberships_touch BEFORE UPDATE ON public.business_memberships FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_branches_touch BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_periods_touch BEFORE UPDATE ON public.financial_periods FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_settings_touch BEFORE UPDATE ON public.business_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER t_memberships_tenant BEFORE UPDATE ON public.business_memberships FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_change();
CREATE TRIGGER t_branches_tenant BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_change();
CREATE TRIGGER t_periods_tenant BEFORE UPDATE ON public.financial_periods FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_change();
CREATE TRIGGER t_periods_guard BEFORE UPDATE OR DELETE ON public.financial_periods FOR EACH ROW EXECUTE FUNCTION public.guard_closed_period();
CREATE TRIGGER t_audit_immutable BEFORE UPDATE OR DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER t_audit_no_truncate BEFORE TRUNCATE ON public.audit_logs FOR EACH STATEMENT EXECUTE FUNCTION public.block_mutation();

CREATE TRIGGER t_businesses_audit AFTER UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER t_memberships_audit AFTER INSERT OR UPDATE OR DELETE ON public.business_memberships FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER t_branches_audit AFTER INSERT OR UPDATE OR DELETE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER t_periods_audit AFTER INSERT OR UPDATE OR DELETE ON public.financial_periods FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER t_settings_audit AFTER UPDATE ON public.business_settings FOR EACH ROW EXECUTE FUNCTION public.audit_row();

-- Profile auto-creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name)
  VALUES (NEW.id, left(NEW.raw_user_meta_data->>'full_name', 200))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== Privileged operations =====
CREATE OR REPLACE FUNCTION public.create_business(_name text, _legal_name text DEFAULT NULL, _pan_vat text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); bid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid) THEN
    RAISE EXCEPTION 'Profile missing' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.businesses(name, legal_name, pan_vat_number, created_by)
  VALUES (btrim(_name), NULLIF(btrim(_legal_name),''), NULLIF(btrim(_pan_vat),''), uid) RETURNING id INTO bid;
  INSERT INTO public.business_memberships(business_id, user_id, role_code, invited_by) VALUES (bid, uid, 'owner', uid);
  INSERT INTO public.business_settings(business_id) VALUES (bid);
  PERFORM public.write_audit(bid, 'create', 'businesses', bid::text, NULL, jsonb_build_object('name', _name));
  RETURN bid;
END $$;

CREATE OR REPLACE FUNCTION public.add_business_member(_business_id uuid, _user_id uuid, _role text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE my_rank smallint; target_rank smallint; mid uuid;
BEGIN
  my_rank := public.business_role_rank(_business_id, auth.uid());
  IF my_rank IS NULL OR my_rank < 80 THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'Cannot change your own membership' USING ERRCODE='42501'; END IF;
  SELECT rank INTO target_rank FROM public.roles WHERE code = _role;
  IF target_rank IS NULL THEN RAISE EXCEPTION 'Unknown role'; END IF;
  IF _role = 'owner' THEN RAISE EXCEPTION 'Use transfer_business_ownership' USING ERRCODE='42501'; END IF;
  IF target_rank >= my_rank THEN RAISE EXCEPTION 'Cannot grant a role equal to or above your own' USING ERRCODE='42501'; END IF;
  INSERT INTO public.business_memberships(business_id, user_id, role_code, invited_by)
  VALUES (_business_id, _user_id, _role, auth.uid()) RETURNING id INTO mid;
  RETURN mid;
END $$;

CREATE OR REPLACE FUNCTION public.update_business_member(_business_id uuid, _user_id uuid, _role text, _status text DEFAULT 'active')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE my_rank smallint; cur_rank smallint; target_rank smallint;
BEGIN
  my_rank := public.business_role_rank(_business_id, auth.uid());
  IF my_rank IS NULL OR my_rank < 80 THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'Cannot change your own membership' USING ERRCODE='42501'; END IF;
  IF _status NOT IN ('active','suspended') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  SELECT r.rank INTO cur_rank FROM public.business_memberships m JOIN public.roles r ON r.code=m.role_code
   WHERE m.business_id=_business_id AND m.user_id=_user_id FOR UPDATE OF m;
  IF cur_rank IS NULL THEN RAISE EXCEPTION 'Membership not found'; END IF;
  SELECT rank INTO target_rank FROM public.roles WHERE code=_role;
  IF target_rank IS NULL OR _role='owner' THEN RAISE EXCEPTION 'Invalid role' USING ERRCODE='42501'; END IF;
  IF cur_rank >= my_rank OR target_rank >= my_rank THEN RAISE EXCEPTION 'Not authorized for this role level' USING ERRCODE='42501'; END IF;
  UPDATE public.business_memberships SET role_code=_role, status=_status WHERE business_id=_business_id AND user_id=_user_id;
END $$;

CREATE OR REPLACE FUNCTION public.remove_business_member(_business_id uuid, _user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE my_rank smallint; cur_rank smallint;
BEGIN
  my_rank := public.business_role_rank(_business_id, auth.uid());
  SELECT r.rank INTO cur_rank FROM public.business_memberships m JOIN public.roles r ON r.code=m.role_code
   WHERE m.business_id=_business_id AND m.user_id=_user_id FOR UPDATE OF m;
  IF cur_rank IS NULL THEN RAISE EXCEPTION 'Membership not found'; END IF;
  IF cur_rank = 100 THEN RAISE EXCEPTION 'Owner cannot be removed; transfer ownership first' USING ERRCODE='42501'; END IF;
  -- members may leave; admins may remove lower ranks
  IF NOT (_user_id = auth.uid() OR (my_rank >= 80 AND cur_rank < my_rank)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.business_memberships WHERE business_id=_business_id AND user_id=_user_id;
END $$;

CREATE OR REPLACE FUNCTION public.transfer_business_ownership(_business_id uuid, _new_owner uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.business_role_rank(_business_id, auth.uid()) IS DISTINCT FROM 100 THEN
    RAISE EXCEPTION 'Only the owner can transfer ownership' USING ERRCODE='42501'; END IF;
  IF _new_owner = auth.uid() THEN RAISE EXCEPTION 'Already owner'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.business_memberships WHERE business_id=_business_id AND user_id=_new_owner AND status='active') THEN
    RAISE EXCEPTION 'New owner must be an active member'; END IF;
  UPDATE public.business_memberships SET role_code='admin' WHERE business_id=_business_id AND user_id=auth.uid();
  UPDATE public.business_memberships SET role_code='owner' WHERE business_id=_business_id AND user_id=_new_owner;
END $$;

CREATE OR REPLACE FUNCTION public.set_financial_period_status(_period_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.financial_periods;
BEGIN
  SELECT * INTO p FROM public.financial_periods WHERE id=_period_id FOR UPDATE;
  IF p.id IS NULL OR NOT public.has_business_role(p.business_id,'accountant') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF p.status='locked' THEN RAISE EXCEPTION 'Locked period is immutable' USING ERRCODE='42501'; END IF;
  IF _status='open' AND NOT public.has_business_role(p.business_id,'admin') THEN
    RAISE EXCEPTION 'Only admins can reopen periods' USING ERRCODE='42501'; END IF;
  IF _status='locked' AND NOT public.has_business_role(p.business_id,'owner') THEN
    RAISE EXCEPTION 'Only the owner can lock periods' USING ERRCODE='42501'; END IF;
  IF _status NOT IN ('open','closed','locked') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  PERFORM set_config('bizsathi.period_op','on',true);
  UPDATE public.financial_periods SET status=_status,
    closed_at = CASE WHEN _status='open' THEN NULL ELSE now() END,
    closed_by = CASE WHEN _status='open' THEN NULL ELSE auth.uid() END
  WHERE id=_period_id;
  PERFORM set_config('bizsathi.period_op','off',true);
END $$;

CREATE OR REPLACE FUNCTION public.archive_business(_business_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.business_role_rank(_business_id, auth.uid()) IS DISTINCT FROM 100 THEN
    RAISE EXCEPTION 'Only the owner can archive' USING ERRCODE='42501'; END IF;
  UPDATE public.businesses SET archived_at = now() WHERE id=_business_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_business(text,text,text), public.add_business_member(uuid,uuid,text),
  public.update_business_member(uuid,uuid,text,text), public.remove_business_member(uuid,uuid),
  public.transfer_business_ownership(uuid,uuid), public.set_financial_period_status(uuid,text),
  public.archive_business(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_business(text,text,text), public.add_business_member(uuid,uuid,text),
  public.update_business_member(uuid,uuid,text,text), public.remove_business_member(uuid,uuid),
  public.transfer_business_ownership(uuid,uuid), public.set_financial_period_status(uuid,text),
  public.archive_business(uuid) TO authenticated;