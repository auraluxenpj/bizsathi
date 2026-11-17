-- 0074: additive business-scoped multi-role access foundation.
-- This migration does not change the active authorization resolver. Legacy membership,
-- branch access and denial rows remain authoritative until the tested Phase B cutover.

CREATE TABLE IF NOT EXISTS public.business_permission_catalog (
  permission text PRIMARY KEY,
  module text NOT NULL,
  action text NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.business_permission_catalog(permission,module,action,label) VALUES
  ('accounts.adjust_create','accounts','adjust_create','accounts adjust create'),
  ('accounts.adjust_edit_delete','accounts','adjust_edit_delete','accounts adjust edit delete'),
  ('accounts.create','accounts','create','accounts create'),
  ('accounts.delete','accounts','delete','accounts delete'),
  ('accounts.edit','accounts','edit','accounts edit'),
  ('accounts.view','accounts','view','accounts view'),
  ('categories.edit_delete','categories','edit_delete','categories edit delete'),
  ('categories.view','categories','view','categories view'),
  ('customers.create','customers','create','customers create'),
  ('customers.delete','customers','delete','customers delete'),
  ('customers.edit','customers','edit','customers edit'),
  ('customers.view','customers','view','customers view'),
  ('expenses.create','expenses','create','expenses create'),
  ('expenses.delete','expenses','delete','expenses delete'),
  ('expenses.edit','expenses','edit','expenses edit'),
  ('expenses.view','expenses','view','expenses view'),
  ('features.business_cards','features','business_cards','features business cards'),
  ('features.greeting_cards','features','greeting_cards','features greeting cards'),
  ('features.import','features','import','features import'),
  ('hr.attendance.create','hr','attendance.create','hr attendance create'),
  ('hr.attendance.edit','hr','attendance.edit','hr attendance edit'),
  ('hr.attendance.view','hr','attendance.view','hr attendance view'),
  ('hr.employees.create','hr','employees.create','hr employees create'),
  ('hr.employees.edit','hr','employees.edit','hr employees edit'),
  ('hr.employees.view','hr','employees.view','hr employees view'),
  ('hr.leave.approve','hr','leave.approve','hr leave approve'),
  ('hr.leave.create','hr','leave.create','hr leave create'),
  ('hr.leave.view','hr','leave.view','hr leave view'),
  ('hr.payroll.approve','hr','payroll.approve','hr payroll approve'),
  ('hr.payroll.manage','hr','payroll.manage','hr payroll manage'),
  ('hr.payroll.view','hr','payroll.view','hr payroll view'),
  ('hr.self.view','hr','self.view','hr self view'),
  ('hr.shifts.manage','hr','shifts.manage','hr shifts manage'),
  ('hr.shifts.view','hr','shifts.view','hr shifts view'),
  ('inventory.create','inventory','create','inventory create'),
  ('inventory.delete','inventory','delete','inventory delete'),
  ('inventory.edit','inventory','edit','inventory edit'),
  ('inventory.view','inventory','view','inventory view'),
  ('notebook.create','notebook','create','notebook create'),
  ('notebook.delete','notebook','delete','notebook delete'),
  ('notebook.edit','notebook','edit','notebook edit'),
  ('notebook.view','notebook','view','notebook view'),
  ('other.change_date','other','change_date','other change date'),
  ('other.party_adjustments','other','party_adjustments','other party adjustments'),
  ('other.purchase_price','other','purchase_price','other purchase price'),
  ('purchases.create','purchases','create','purchases create'),
  ('purchases.delete','purchases','delete','purchases delete'),
  ('purchases.edit','purchases','edit','purchases edit'),
  ('purchases.view','purchases','view','purchases view'),
  ('reports.business_status','reports','business_status','reports business status'),
  ('reports.expenses','reports','expenses','reports expenses'),
  ('reports.home_stats','reports','home_stats','reports home stats'),
  ('reports.items','reports','items','reports items'),
  ('reports.parties','reports','parties','reports parties'),
  ('reports.transactions','reports','transactions','reports transactions'),
  ('reports.view','reports','view','reports view'),
  ('sales.create','sales','create','sales create'),
  ('sales.delete','sales','delete','sales delete'),
  ('sales.edit','sales','edit','sales edit'),
  ('sales.view','sales','view','sales view'),
  ('settings.delete_business','settings','delete_business','settings delete business'),
  ('settings.edit','settings','edit','settings edit'),
  ('settings.invoice','settings','invoice','settings invoice'),
  ('settings.item','settings','item','settings item'),
  ('settings.party','settings','party','settings party'),
  ('settings.transaction','settings','transaction','settings transaction'),
  ('staff.create','staff','create','staff create'),
  ('staff.delete','staff','delete','staff delete'),
  ('staff.edit','staff','edit','staff edit'),
  ('staff.view','staff','view','staff view'),
  ('stock.create','stock','create','stock create'),
  ('stock.delete','stock','delete','stock delete'),
  ('stock.edit','stock','edit','stock edit'),
  ('suppliers.create','suppliers','create','suppliers create'),
  ('suppliers.delete','suppliers','delete','suppliers delete'),
  ('suppliers.edit','suppliers','edit','suppliers edit'),
  ('suppliers.view','suppliers','view','suppliers view')
ON CONFLICT (permission) DO UPDATE SET module=EXCLUDED.module, action=EXCLUDED.action, label=EXCLUDED.label;

-- Include any historical keys that may not yet appear in the current UI catalogue.
INSERT INTO public.business_permission_catalog(permission,module,action,label)
SELECT DISTINCT p.permission,split_part(p.permission,'.',1),
       COALESCE(NULLIF(regexp_replace(p.permission,'^[^.]+\.',''),p.permission),'manage'),
       initcap(replace(replace(p.permission,'.',' '),'_',' '))
FROM (
  SELECT permission FROM public.job_title_denials
  UNION SELECT permission FROM public.member_permission_denials
  UNION SELECT unnest(denied_permissions) FROM public.business_role_templates
) p
ON CONFLICT (permission) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.business_access_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  description text,
  authority_rank smallint NOT NULL CHECK (authority_rank BETWEEN 1 AND 100),
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,id),
  UNIQUE (business_id,code)
);

CREATE TABLE IF NOT EXISTS public.business_access_role_permissions (
  business_id uuid NOT NULL,
  role_id uuid NOT NULL,
  permission text NOT NULL REFERENCES public.business_permission_catalog(permission) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,role_id,permission),
  FOREIGN KEY (business_id,role_id) REFERENCES public.business_access_roles(business_id,id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.business_member_access_roles (
  business_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  is_default boolean NOT NULL DEFAULT false,
  PRIMARY KEY (business_id,user_id,role_id),
  FOREIGN KEY (business_id,user_id) REFERENCES public.business_memberships(business_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,role_id) REFERENCES public.business_access_roles(business_id,id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS business_member_access_roles_user_idx
  ON public.business_member_access_roles(business_id,user_id);
CREATE INDEX IF NOT EXISTS business_access_role_permissions_role_idx
  ON public.business_access_role_permissions(business_id,role_id);

ALTER TABLE public.business_permission_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_access_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_access_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_member_access_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_permission_catalog, public.business_access_roles,
  public.business_access_role_permissions, public.business_member_access_roles
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.business_permission_catalog, public.business_access_roles,
  public.business_access_role_permissions, public.business_member_access_roles TO service_role;

COMMENT ON TABLE public.business_access_roles IS
  'Business-scoped access roles. Position/job_title remains a separate HR designation.';
COMMENT ON TABLE public.business_access_role_permissions IS
  'Explicit permission grants belonging to a business access role.';
COMMENT ON TABLE public.business_member_access_roles IS
  'Many-to-many employee-to-role assignments. Branch scope remains in branch_memberships.';
COMMENT ON TABLE public.business_member_access_roles IS
  'Default assignment rows are compatibility backfills; manually assigned roles use is_default=false.';

CREATE OR REPLACE FUNCTION public.seed_business_access_roles(_business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id=_business_id) THEN
    RAISE EXCEPTION 'Business unavailable';
  END IF;

  INSERT INTO public.business_access_roles(business_id,code,name,description,authority_rank,is_system)
  SELECT _business_id,'legacy_'||role_row.code,role_row.name,
         'Compatibility role migrated from the existing business membership role.',
         role_row.rank,true
  FROM public.roles role_row
  ON CONFLICT (business_id,code) DO NOTHING;

  FOR v_item IN
    SELECT x.job_title, public.job_title_role(x.job_title) AS base_role,
           CASE x.job_title
             WHEN 'partner' THEN 'Partner'
             WHEN 'manager' THEN 'Manager'
             WHEN 'branch_manager' THEN 'Branch Manager'
             WHEN 'accountant' THEN 'Accountant'
             WHEN 'sales_person' THEN 'Sales Person'
             WHEN 'stock_manager' THEN 'Stock Manager'
             WHEN 'entry_person' THEN 'Entry Person'
           END AS role_name
    FROM (VALUES ('partner'),('manager'),('branch_manager'),('accountant'),
                 ('sales_person'),('stock_manager'),('entry_person')) AS x(job_title)
  LOOP
    INSERT INTO public.business_access_roles(business_id,code,name,description,authority_rank,is_system)
    SELECT _business_id,'position_'||v_item.job_title,v_item.role_name,
           'Compatibility role seeded from the existing position permission template.',
           gr.rank,true
    FROM public.roles gr
    WHERE gr.code=v_item.base_role
    ON CONFLICT (business_id,code) DO NOTHING;
  END LOOP;

  -- Legacy role grants preserve the existing role preset ceilings.
  FOR r IN
    SELECT br.id, br.code,
      CASE br.code
        WHEN 'legacy_owner' THEN ARRAY[]::text[]
        WHEN 'legacy_admin' THEN ARRAY['settings.delete_business']::text[]
        WHEN 'legacy_accountant' THEN ARRAY(SELECT d.permission FROM public.job_title_denials d WHERE d.job_title='accountant')
        WHEN 'legacy_branch_manager' THEN ARRAY(SELECT d.permission FROM public.job_title_denials d WHERE d.job_title='branch_manager')
        WHEN 'legacy_staff' THEN ARRAY(SELECT d.permission FROM public.job_title_denials d WHERE d.job_title='sales_person')
        WHEN 'legacy_viewer' THEN ARRAY(
          SELECT p.permission FROM public.business_permission_catalog p
          WHERE NOT (p.permission ~ '\.view$' OR p.permission='reports.home_stats')
             OR p.permission IN ('staff.view','accounts.view','reports.view')
        )
        ELSE ARRAY[]::text[]
      END AS denied
    FROM public.business_access_roles br
    WHERE br.business_id=_business_id AND br.code LIKE 'legacy_%'
  LOOP
    INSERT INTO public.business_access_role_permissions(business_id,role_id,permission)
    SELECT _business_id,v_item.id,p.permission
    FROM public.business_permission_catalog p
    WHERE NOT (p.permission = ANY(v_item.denied))
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Position roles inherit the business-specific template when present; otherwise
  -- they inherit the existing global job-title denial template.
  FOR r IN
    SELECT br.id, substring(br.code from 10) AS job_title,
      COALESCE(t.denied_permissions,
        ARRAY(SELECT d.permission FROM public.job_title_denials d WHERE d.job_title=substring(br.code from 10))
      ) AS denied
    FROM public.business_access_roles br
    LEFT JOIN public.business_role_templates t
      ON t.business_id=br.business_id AND t.job_title=substring(br.code from 10)
    WHERE br.business_id=_business_id AND br.code LIKE 'position_%'
  LOOP
    INSERT INTO public.business_access_role_permissions(business_id,role_id,permission)
    SELECT _business_id,r.id,p.permission
    FROM public.business_permission_catalog p
    WHERE NOT (p.permission = ANY(r.denied))
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_business_access_roles(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.seed_business_access_roles_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_business_access_roles(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_business_access_roles_on_insert() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS seed_business_access_roles_after_insert ON public.businesses;
CREATE TRIGGER seed_business_access_roles_after_insert
AFTER INSERT ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.seed_business_access_roles_on_insert();

-- Seed existing businesses before backfilling memberships.
SELECT public.seed_business_access_roles(id) FROM public.businesses;


CREATE OR REPLACE FUNCTION public.refresh_position_access_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $refresh_position_access_role_permissions$
DECLARE
  v_business uuid := COALESCE(NEW.business_id,OLD.business_id);
  v_title text := COALESCE(NEW.job_title,OLD.job_title);
  v_role_id uuid;
  v_denied text[];
BEGIN
  SELECT id INTO v_role_id
  FROM public.business_access_roles
  WHERE business_id=v_business AND code='position_'||v_title;
  IF v_role_id IS NULL THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP='DELETE' THEN
    SELECT COALESCE(array_agg(permission),ARRAY[]::text[]) INTO v_denied
    FROM public.job_title_denials WHERE job_title=v_title;
  ELSE
    v_denied := NEW.denied_permissions;
  END IF;

  DELETE FROM public.business_access_role_permissions
  WHERE business_id=v_business AND role_id=v_role_id;

  INSERT INTO public.business_access_role_permissions(business_id,role_id,permission)
  SELECT v_business,v_role_id,p.permission
  FROM public.business_permission_catalog p
  WHERE NOT (p.permission=ANY(COALESCE(v_denied,ARRAY[]::text[])))
  ON CONFLICT DO NOTHING;

  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$refresh_position_access_role_permissions$;
REVOKE ALL ON FUNCTION public.refresh_position_access_role_permissions() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS refresh_position_access_role_permissions ON public.business_role_templates;
CREATE TRIGGER refresh_position_access_role_permissions
AFTER INSERT OR UPDATE OR DELETE ON public.business_role_templates
FOR EACH ROW EXECUTE FUNCTION public.refresh_position_access_role_permissions();


CREATE OR REPLACE FUNCTION public.sync_default_business_access_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_role_id uuid;
  v_has_default boolean := false;
BEGIN
  IF TG_OP='UPDATE' THEN
    SELECT true INTO v_has_default
    FROM public.business_member_access_roles
    WHERE business_id=NEW.business_id AND user_id=NEW.user_id AND is_default
    LIMIT 1;
    IF NOT COALESCE(v_has_default,false) THEN RETURN NEW; END IF;
  END IF;

  v_code := CASE
    WHEN NEW.job_title IS NOT NULL THEN 'position_'||NEW.job_title
    ELSE 'legacy_'||NEW.role_code
  END;
  SELECT id INTO v_role_id
  FROM public.business_access_roles
  WHERE business_id=NEW.business_id AND code=v_code AND is_active;

  IF v_role_id IS NULL THEN
    v_code := 'legacy_'||NEW.role_code;
    SELECT id INTO v_role_id
    FROM public.business_access_roles
    WHERE business_id=NEW.business_id AND code=v_code AND is_active;
  END IF;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Default access role is not configured for this membership';
  END IF;

  DELETE FROM public.business_member_access_roles
  WHERE business_id=NEW.business_id AND user_id=NEW.user_id AND is_default;

  INSERT INTO public.business_member_access_roles
    (business_id,user_id,role_id,assigned_by,is_default)
  VALUES (NEW.business_id,NEW.user_id,v_role_id,NEW.invited_by,true)
  ON CONFLICT (business_id,user_id,role_id)
  DO UPDATE SET is_default=true,assigned_by=EXCLUDED.assigned_by,assigned_at=now();

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_default_business_access_role() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sync_default_business_access_role ON public.business_memberships;
CREATE TRIGGER sync_default_business_access_role
AFTER INSERT OR UPDATE OF role_code,job_title ON public.business_memberships
FOR EACH ROW EXECUTE FUNCTION public.sync_default_business_access_role();

-- Backfill one equivalent default access role for every existing membership. This
-- preserves every original membership and all branch grants; it does not change the
-- legacy authorization resolver or grant new permissions during this foundation phase.
INSERT INTO public.business_member_access_roles
  (business_id,user_id,role_id,assigned_by,is_default)
SELECT m.business_id,m.user_id,br.id,m.invited_by,true
FROM public.business_memberships m
JOIN public.business_access_roles br
  ON br.business_id=m.business_id
 AND br.code=CASE WHEN m.job_title IS NOT NULL THEN 'position_'||m.job_title ELSE 'legacy_'||m.role_code END
ON CONFLICT (business_id,user_id,role_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_business_access_roles(_business uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF COALESCE(public.business_role_rank(_business,auth.uid()),0)<80 THEN
    RAISE EXCEPTION 'Administrator access is required' USING ERRCODE='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',r.id,'code',r.code,'name',r.name,'description',r.description,
    'authorityRank',r.authority_rank,'isSystem',r.is_system,'isActive',r.is_active,
    'permissions',COALESCE((
      SELECT jsonb_agg(rp.permission ORDER BY rp.permission)
      FROM public.business_access_role_permissions rp
      WHERE rp.business_id=r.business_id AND rp.role_id=r.id
    ),'[]'::jsonb)
  ) ORDER BY r.is_system DESC,r.name),'[]'::jsonb)
  INTO result
  FROM public.business_access_roles r
  WHERE r.business_id=_business;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_business_access_roles(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_business_access_roles(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_business_access_role(
  _business uuid,_name text,_description text,_authority_rank smallint,_permissions text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_rank smallint;
  new_id uuid;
  role_code text;
  p text;
BEGIN
  actor_rank := public.business_role_rank(_business,auth.uid());
  IF auth.uid() IS NULL OR actor_rank IS NULL OR actor_rank<80 THEN
    RAISE EXCEPTION 'Administrator access is required' USING ERRCODE='42501';
  END IF;
  IF _authority_rank IS NULL OR _authority_rank<1 OR _authority_rank>=80 OR _authority_rank>=actor_rank THEN
    RAISE EXCEPTION 'Custom role authority must be below administrator authority' USING ERRCODE='42501';
  END IF;
  IF _name IS NULL OR char_length(btrim(_name)) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Role name must contain 2 to 80 characters';
  END IF;
  IF cardinality(COALESCE(_permissions,'{}'))>200 THEN RAISE EXCEPTION 'Too many permissions'; END IF;
  FOREACH p IN ARRAY COALESCE(_permissions,'{}') LOOP
    IF NOT EXISTS(SELECT 1 FROM public.business_permission_catalog WHERE permission=p) THEN
      RAISE EXCEPTION 'Unknown permission: %',p;
    END IF;
    IF NOT public.has_permission(_business,p) THEN
      RAISE EXCEPTION 'You cannot delegate a permission you do not have' USING ERRCODE='42501';
    END IF;
  END LOOP;

  role_code := 'custom_'||replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.business_access_roles(business_id,code,name,description,authority_rank,is_system,created_by)
  VALUES (_business,role_code,btrim(_name),NULLIF(btrim(COALESCE(_description,'')),''),_authority_rank,false,auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO public.business_access_role_permissions(business_id,role_id,permission)
  SELECT _business,new_id,p FROM unnest(COALESCE(_permissions,'{}')) p
  ON CONFLICT DO NOTHING;

  PERFORM public.write_audit(_business,'access_role.create','business_access_roles',new_id::text,NULL,
    jsonb_build_object('name',btrim(_name),'authority_rank',_authority_rank,'permissions',to_jsonb(COALESCE(_permissions,'{}'))));
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_business_access_role(uuid,text,text,smallint,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_business_access_role(uuid,text,text,smallint,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_business_access_role(_business uuid,_user uuid,_role uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_rank smallint;
  target_rank smallint;
  role_rank smallint;
  p text;
BEGIN
  actor_rank := public.business_role_rank(_business,auth.uid());
  target_rank := public.business_role_rank(_business,_user);
  IF auth.uid() IS NULL OR actor_rank IS NULL OR actor_rank<80 OR _user=auth.uid()
     OR target_rank IS NULL OR target_rank>=actor_rank THEN
    RAISE EXCEPTION 'Not authorized to assign roles to this employee' USING ERRCODE='42501';
  END IF;
  SELECT authority_rank INTO role_rank
  FROM public.business_access_roles
  WHERE business_id=_business AND id=_role AND is_active;
  IF role_rank IS NULL OR role_rank>=actor_rank OR role_rank>=80 THEN
    RAISE EXCEPTION 'Role is unavailable or exceeds your authority' USING ERRCODE='42501';
  END IF;
  FOR p IN
    SELECT permission FROM public.business_access_role_permissions
    WHERE business_id=_business AND role_id=_role
  LOOP
    IF NOT public.has_permission(_business,p) THEN
      RAISE EXCEPTION 'You cannot delegate a permission you do not have' USING ERRCODE='42501';
    END IF;
  END LOOP;
  INSERT INTO public.business_member_access_roles
    (business_id,user_id,role_id,assigned_by,is_default)
  VALUES (_business,_user,_role,auth.uid(),false)
  ON CONFLICT (business_id,user_id,role_id) DO NOTHING;
  PERFORM public.write_audit(_business,'access_role.assign','business_member_access_roles',_user::text,NULL,
    jsonb_build_object('role_id',_role));
END;
$$;
REVOKE ALL ON FUNCTION public.assign_business_access_role(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_business_access_role(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unassign_business_access_role(_business uuid,_user uuid,_role uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_rank smallint;
  target_rank smallint;
  assignment_count integer;
BEGIN
  actor_rank := public.business_role_rank(_business,auth.uid());
  target_rank := public.business_role_rank(_business,_user);
  IF auth.uid() IS NULL OR actor_rank IS NULL OR actor_rank<80 OR _user=auth.uid()
     OR target_rank IS NULL OR target_rank>=actor_rank THEN
    RAISE EXCEPTION 'Not authorized to change roles for this employee' USING ERRCODE='42501';
  END IF;
  SELECT count(*) INTO assignment_count
  FROM public.business_member_access_roles
  WHERE business_id=_business AND user_id=_user;
  IF assignment_count<=1 THEN
    RAISE EXCEPTION 'An employee must retain at least one access role';
  END IF;
  DELETE FROM public.business_member_access_roles
  WHERE business_id=_business AND user_id=_user AND role_id=_role AND is_default=false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only an additional assigned role can be removed';
  END IF;
  PERFORM public.write_audit(_business,'access_role.unassign','business_member_access_roles',_user::text,NULL,
    jsonb_build_object('role_id',_role));
END;
$$;
REVOKE ALL ON FUNCTION public.unassign_business_access_role(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.unassign_business_access_role(uuid,uuid,uuid) TO authenticated;

COMMENT ON FUNCTION public.get_business_access_roles(uuid) IS
  'Lists business-scoped access roles for administrators; direct role tables are not exposed.';
COMMENT ON FUNCTION public.create_business_access_role(uuid,text,text,smallint,text[]) IS
  'Creates a custom role below administrator rank and only delegates permissions held by the actor.';
COMMENT ON FUNCTION public.assign_business_access_role(uuid,uuid,uuid) IS
  'Assigns an additional business role to a lower-ranked active member; branch grants remain separate.';
COMMENT ON FUNCTION public.unassign_business_access_role(uuid,uuid,uuid) IS
  'Removes an additional role while preserving the default compatibility assignment.';

