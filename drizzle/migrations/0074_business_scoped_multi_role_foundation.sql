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
  FOR v_item IN
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
  FOR v_item IN
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
    SELECT _business_id,v_item.id,p.permission
    FROM public.business_permission_catalog p
    WHERE NOT (p.permission = ANY(v_item.denied))
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
  v_role_code text;
  v_job_title text;
  v_has_default boolean := false;
BEGIN
  IF current_setting('bizsathi.skip_access_role_sync',true)='on' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    SELECT true INTO v_has_default
    FROM public.business_member_access_roles
    WHERE business_id=NEW.business_id AND user_id=NEW.user_id AND is_default
    LIMIT 1;
    IF NOT COALESCE(v_has_default,false) THEN RETURN NEW; END IF;
  END IF;

  -- Read the current row rather than relying on NEW: an earlier AFTER INSERT trigger
  -- may already have applied the invitation's stored job title.
  SELECT job_title,role_code INTO v_job_title,v_role_code
  FROM public.business_memberships
  WHERE business_id=NEW.business_id AND user_id=NEW.user_id;
  v_code := CASE
    WHEN v_job_title IS NOT NULL THEN 'position_'||v_job_title
    ELSE 'legacy_'||v_role_code
  END;
  SELECT id INTO v_role_id
  FROM public.business_access_roles
  WHERE business_id=NEW.business_id AND code=v_code AND is_active;

  IF v_role_id IS NULL THEN
    v_code := 'legacy_'||v_role_code;
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
    'id',v_item.id,'code',r.code,'name',r.name,'description',r.description,
    'authorityRank',r.authority_rank,'isSystem',r.is_system,'isActive',r.is_active,
    'permissions',COALESCE((
      SELECT jsonb_agg(rp.permission ORDER BY rp.permission)
      FROM public.business_access_role_permissions rp
      WHERE rp.business_id=r.business_id AND rp.role_id=v_item.id
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
  IF _authority_rank IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Custom permission roles cannot elevate business authority' USING ERRCODE='42501';
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
  SELECT _business,new_id,permission_code FROM unnest(COALESCE(_permissions,'{}')) AS permission_code
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



-- Align the database denial allow-list with the complete application permission catalogue.
ALTER TABLE public.member_permission_denials
  DROP CONSTRAINT IF EXISTS member_permission_denials_permission_check;
ALTER TABLE public.member_permission_denials
  ADD CONSTRAINT member_permission_denials_permission_check
  CHECK (permission = ANY (ARRAY['accounts.adjust_create','accounts.adjust_edit_delete','accounts.create','accounts.delete','accounts.edit','accounts.view','categories.edit_delete','categories.view','customers.create','customers.delete','customers.edit','customers.view','expenses.create','expenses.delete','expenses.edit','expenses.view','features.business_cards','features.greeting_cards','features.import','hr.attendance.create','hr.attendance.edit','hr.attendance.view','hr.employees.create','hr.employees.edit','hr.employees.view','hr.leave.approve','hr.leave.create','hr.leave.view','hr.payroll.approve','hr.payroll.manage','hr.payroll.view','hr.self.view','hr.shifts.manage','hr.shifts.view','inventory.create','inventory.delete','inventory.edit','inventory.view','notebook.create','notebook.delete','notebook.edit','notebook.view','other.change_date','other.party_adjustments','other.purchase_price','purchases.create','purchases.delete','purchases.edit','purchases.view','reports.business_status','reports.expenses','reports.home_stats','reports.items','reports.parties','reports.transactions','reports.view','sales.create','sales.delete','sales.edit','sales.view','settings.delete_business','settings.edit','settings.invoice','settings.item','settings.party','settings.transaction','staff.create','staff.delete','staff.edit','staff.view','stock.create','stock.delete','stock.edit','suppliers.create','suppliers.delete','suppliers.edit','suppliers.view']::text[]));

-- Position permissions are resolved from assigned role grants; member denials always win.
-- The legacy role_code continues to provide the protected business authority rank.
CREATE OR REPLACE FUNCTION public.has_permission(_business uuid,_perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $multi_role_permission$
  SELECT auth.uid() IS NULL
    OR public.platform_owner_check(auth.uid())
    OR (
      COALESCE(public.business_role_rank(_business,auth.uid()),0)>0
      AND NOT EXISTS (
        SELECT 1 FROM public.member_permission_denials d
        WHERE d.business_id=_business AND d.user_id=auth.uid() AND d.permission=_perm
      )
      AND EXISTS (
        SELECT 1
        FROM public.business_member_access_roles a
        JOIN public.business_access_roles r
          ON r.business_id=a.business_id AND r.id=a.role_id AND r.is_active
        JOIN public.business_access_role_permissions rp
          ON rp.business_id=a.business_id AND rp.role_id=a.role_id
        WHERE a.business_id=_business AND a.user_id=auth.uid()
          AND rp.permission=_perm
      )
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.business_member_access_roles a
          JOIN public.business_access_roles r
            ON r.business_id=a.business_id AND r.id=a.role_id AND r.is_active
          WHERE a.business_id=_business AND a.user_id=auth.uid()
            AND r.code IN ('position_branch_manager','legacy_branch_manager')
        )
        OR COALESCE(public.business_role_rank(_business,auth.uid()),0)>50
        OR _perm = ANY (ARRAY[
          'sales.view','expenses.view','inventory.view','categories.view',
          'stock.create','stock.edit','customers.view','suppliers.view','staff.view',
          'reports.view','reports.home_stats','reports.expenses','reports.items','reports.parties','reports.transactions'
        ]::text[])
      )
    )
$multi_role_permission$;
REVOKE ALL ON FUNCTION public.has_permission(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid,text) TO authenticated;

-- A position is an HR designation. Updating it must not silently change the
-- employee's assigned access roles or security rank.
CREATE OR REPLACE FUNCTION public.set_member_job_title(_business uuid,_user uuid,_title text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $set_member_job_title$
DECLARE
  actor_rank smallint;
  target_rank smallint;
  current_status text;
BEGIN
  actor_rank := public.business_role_rank(_business,auth.uid());
  target_rank := public.business_role_rank(_business,_user);
  IF auth.uid() IS NULL OR actor_rank IS NULL OR actor_rank<80
     OR _user=auth.uid() OR target_rank IS NULL OR target_rank>=actor_rank THEN
    RAISE EXCEPTION 'Not authorized to change this employee designation' USING ERRCODE='42501';
  END IF;
  IF _title IS NOT NULL AND public.job_title_role(_title) IS NULL THEN
    RAISE EXCEPTION 'Unknown position';
  END IF;
  SELECT status INTO current_status
  FROM public.business_memberships
  WHERE business_id=_business AND user_id=_user
  FOR UPDATE;
  IF current_status IS NULL THEN RAISE EXCEPTION 'Employee not found'; END IF;

  PERFORM set_config('bizsathi.skip_access_role_sync','on',true);
  UPDATE public.business_memberships SET job_title=_title
  WHERE business_id=_business AND user_id=_user;
  PERFORM set_config('bizsathi.skip_access_role_sync','off',true);

  PERFORM public.write_audit(_business,'job_title.update','business_memberships',_user::text,
    NULL,jsonb_build_object('title',_title));
END;
$set_member_job_title$;
REVOKE ALL ON FUNCTION public.set_member_job_title(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_member_job_title(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_business_member_access_roles(_business uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $member_access_roles$
DECLARE result jsonb;
BEGIN
  IF COALESCE(public.business_role_rank(_business,auth.uid()),0)<80 THEN
    RAISE EXCEPTION 'Administrator access is required' USING ERRCODE='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'userId',a.user_id,'roleId',r.id,'roleCode',r.code,'roleName',r.name,
    'isDefault',a.is_default,'assignedAt',a.assigned_at
  ) ORDER BY a.user_id,r.name),'[]'::jsonb)
  INTO result
  FROM public.business_member_access_roles a
  JOIN public.business_access_roles r
    ON r.business_id=a.business_id AND r.id=a.role_id
  JOIN public.business_memberships m
    ON m.business_id=a.business_id AND m.user_id=a.user_id
  WHERE a.business_id=_business AND m.status='active';
  RETURN result;
END;
$member_access_roles$;
REVOKE ALL ON FUNCTION public.get_business_member_access_roles(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_business_member_access_roles(uuid) TO authenticated;



CREATE OR REPLACE FUNCTION public.update_business_access_role(
  _business uuid,_role uuid,_name text,_description text,_permissions text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $update_business_access_role$
DECLARE
  actor_rank smallint;
  role_rank smallint;
  old_permissions jsonb;
  p text;
BEGIN
  actor_rank := public.business_role_rank(_business,auth.uid());
  IF auth.uid() IS NULL OR actor_rank IS NULL OR actor_rank<80 THEN
    RAISE EXCEPTION 'Administrator access is required' USING ERRCODE='42501';
  END IF;
  IF _name IS NULL OR char_length(btrim(_name)) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Role name must contain 2 to 80 characters';
  END IF;
  SELECT authority_rank INTO role_rank
  FROM public.business_access_roles
  WHERE business_id=_business AND id=_role AND is_active AND NOT is_system
  FOR UPDATE;
  IF role_rank IS NULL OR role_rank>=actor_rank THEN
    RAISE EXCEPTION 'Custom role is unavailable or exceeds your authority' USING ERRCODE='42501';
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

  SELECT COALESCE(jsonb_agg(permission ORDER BY permission),'[]'::jsonb)
  INTO old_permissions
  FROM public.business_access_role_permissions
  WHERE business_id=_business AND role_id=_role;

  UPDATE public.business_access_roles
  SET name=btrim(_name),description=NULLIF(btrim(COALESCE(_description,'')),'')
  WHERE business_id=_business AND id=_role;

  DELETE FROM public.business_access_role_permissions
  WHERE business_id=_business AND role_id=_role;
  INSERT INTO public.business_access_role_permissions(business_id,role_id,permission)
  SELECT _business,_role,permission_code
  FROM unnest(COALESCE(_permissions,'{}')) AS permission_code
  ON CONFLICT DO NOTHING;

  PERFORM public.write_audit(_business,'access_role.update','business_access_roles',_role::text,
    jsonb_build_object('permissions',old_permissions),
    jsonb_build_object('name',btrim(_name),'permissions',to_jsonb(COALESCE(_permissions,'{}'))));
END;
$update_business_access_role$;
REVOKE ALL ON FUNCTION public.update_business_access_role(uuid,uuid,text,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_business_access_role(uuid,uuid,text,text,text[]) TO authenticated;



-- Security rank is the maximum of the legacy membership rank and assigned built-in
-- access-role ranks. Custom permission bundles are always rank 1 and cannot elevate it.
CREATE OR REPLACE FUNCTION public.business_role_rank(_business_id uuid,_user_id uuid DEFAULT auth.uid())
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $multi_role_rank$
  SELECT CASE
    WHEN public.platform_owner_check(_user_id) THEN
      (SELECT 100::smallint FROM public.businesses b WHERE b.id=_business_id AND b.archived_at IS NULL)
    ELSE (
      SELECT GREATEST(r.rank,COALESCE(MAX(ar.authority_rank),0))::smallint
      FROM public.business_memberships m
      JOIN public.businesses b ON b.id=m.business_id AND b.archived_at IS NULL
      JOIN public.roles r ON r.code=m.role_code
      LEFT JOIN public.business_member_access_roles a
        ON a.business_id=m.business_id AND a.user_id=m.user_id
      LEFT JOIN public.business_access_roles ar
        ON ar.business_id=a.business_id AND ar.id=a.role_id AND ar.is_active
      WHERE m.business_id=_business_id AND m.user_id=_user_id
        AND m.status='active' AND _user_id IS NOT NULL
      GROUP BY r.rank
    )
  END
$multi_role_rank$;
REVOKE ALL ON FUNCTION public.business_role_rank(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_role_rank(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.has_business_access_role(_business uuid,_role_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $has_business_access_role$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.business_member_access_roles a
    JOIN public.business_access_roles r
      ON r.business_id=a.business_id AND r.id=a.role_id AND r.is_active
    JOIN public.business_memberships m
      ON m.business_id=a.business_id AND m.user_id=a.user_id AND m.status='active'
    WHERE a.business_id=_business AND a.user_id=auth.uid() AND r.code=_role_code
  )
$has_business_access_role$;
REVOKE ALL ON FUNCTION public.has_business_access_role(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_business_access_role(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_approve_inventory_count(_business_id uuid,_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $multi_role_count_approval$
  SELECT auth.uid() IS NOT NULL
    AND public.can_access_branch(_business_id,_branch_id)
    AND (
      public.has_business_role(_business_id,'admin')
      OR (
        (public.has_business_access_role(_business_id,'position_branch_manager')
         OR public.has_business_access_role(_business_id,'legacy_branch_manager'))
        AND public.has_permission(_business_id,'stock.edit')
      )
    )
$multi_role_count_approval$;
REVOKE ALL ON FUNCTION public.can_approve_inventory_count(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_approve_inventory_count(uuid,uuid) TO authenticated,service_role;



CREATE OR REPLACE FUNCTION public.member_role_denials(_business uuid)
RETURNS TABLE(user_id uuid,permission text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $effective_role_denials$
BEGIN
  IF COALESCE(public.business_role_rank(_business,auth.uid()),0)<80 THEN
    RAISE EXCEPTION 'Administrator access is required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT m.user_id,p.permission
  FROM public.business_memberships m
  CROSS JOIN public.business_permission_catalog p
  WHERE m.business_id=_business AND m.status='active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.business_member_access_roles a
      JOIN public.business_access_roles r
        ON r.business_id=a.business_id AND r.id=a.role_id AND r.is_active
      JOIN public.business_access_role_permissions rp
        ON rp.business_id=a.business_id AND rp.role_id=a.role_id
      WHERE a.business_id=m.business_id AND a.user_id=m.user_id
        AND rp.permission=p.permission
    )
  ORDER BY m.user_id,p.permission;
END;
$effective_role_denials$;
REVOKE ALL ON FUNCTION public.member_role_denials(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.member_role_denials(uuid) TO authenticated;



-- Operational cashier permissions are access-role based, not HR-title based.
CREATE OR REPLACE FUNCTION public.can_read_cash_counter_session(_business_id uuid,_branch_id uuid,_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $cash_counter_read$
  SELECT public.can_access_branch(_business_id,_branch_id)
    AND (
      public.has_business_role(_business_id,'accountant')
      OR (
        (public.has_business_access_role(_business_id,'position_branch_manager')
         OR public.has_business_access_role(_business_id,'legacy_branch_manager'))
        AND public.has_permission(_business_id,'sales.view')
      )
      OR (
        (public.has_business_access_role(_business_id,'position_sales_person')
         OR public.has_business_access_role(_business_id,'legacy_staff'))
        AND public.has_permission(_business_id,'sales.view')
        AND EXISTS (
          SELECT 1 FROM public.cash_counter_events opening
          WHERE opening.business_id=_business_id AND opening.branch_id=_branch_id
            AND opening.session_id=_session_id AND opening.kind='open'
            AND opening.actor_id=auth.uid()
        )
      )
    )
$cash_counter_read$;
REVOKE ALL ON FUNCTION public.can_read_cash_counter_session(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_cash_counter_session(uuid,uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_cashier_job_title_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $cashier_access_guard$
DECLARE
  document_kind text;
  has_sales_role boolean;
BEGIN
  has_sales_role :=
    public.has_business_access_role(NEW.business_id,'position_sales_person')
    OR public.has_business_access_role(NEW.business_id,'position_entry_person')
    OR public.has_business_access_role(NEW.business_id,'legacy_staff');

  IF TG_TABLE_NAME='commerce_documents' THEN
    IF NEW.kind='sale'
       AND NOT public.has_business_role(NEW.business_id,'accountant')
       AND NOT (public.has_permission(NEW.business_id,'sales.create') AND has_sales_role) THEN
      RAISE EXCEPTION 'Sales access requires an assigned Sales Person or Store Team access role';
    END IF;
  ELSIF TG_TABLE_NAME='commerce_payments' THEN
    SELECT d.kind INTO document_kind
    FROM public.commerce_documents d
    WHERE d.id=NEW.document_id AND d.business_id=NEW.business_id;
    IF document_kind='sale'
       AND NOT public.has_business_role(NEW.business_id,'accountant')
       AND NOT (public.has_permission(NEW.business_id,'sales.create') AND has_sales_role) THEN
      RAISE EXCEPTION 'Sales payment access requires an assigned Sales Person or Store Team access role';
    END IF;
  ELSIF TG_TABLE_NAME='cash_counter_events' THEN
    IF NOT public.has_business_role(NEW.business_id,'accountant')
       AND NOT (
         public.has_business_access_role(NEW.business_id,'position_sales_person')
         OR public.has_business_access_role(NEW.business_id,'legacy_staff')
       ) THEN
      RAISE EXCEPTION 'Cash counter access requires an assigned Sales Person access role';
    END IF;
  END IF;
  RETURN NEW;
END;
$cashier_access_guard$;
REVOKE ALL ON FUNCTION public.guard_cashier_job_title_writes() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.is_cashier_sale_or_return(_business_id uuid,_branch_id uuid,_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $cashier_sale_return$
  SELECT (
      public.has_business_access_role(_business_id,'position_sales_person')
      OR public.has_business_access_role(_business_id,'legacy_staff')
    )
    AND public.has_permission(_business_id,'sales.view')
    AND EXISTS (
      SELECT 1
      FROM public.commerce_documents d
      WHERE d.id=_document_id AND d.business_id=_business_id
        AND d.branch_id=_branch_id
        AND (
          (d.kind='sale' AND d.actor_id=auth.uid())
          OR (
            d.kind='sale_return' AND d.status='confirmed'
            AND EXISTS (
              SELECT 1 FROM public.commerce_documents original
              WHERE original.id=d.source_id AND original.business_id=_business_id
                AND original.branch_id=_branch_id AND original.kind='sale'
                AND original.status='confirmed' AND original.actor_id=auth.uid()
            )
          )
        )
    )
$cashier_sale_return$;
REVOKE ALL ON FUNCTION public.is_cashier_sale_or_return(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_cashier_sale_or_return(uuid,uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.loyalty_available_points(_business uuid,_mobile text)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $loyalty_access$
DECLARE
  n text := public.normalize_member_mobile(_mobile);
  m uuid;
  has_sales_role boolean;
BEGIN
  has_sales_role :=
    public.has_business_access_role(_business,'position_sales_person')
    OR public.has_business_access_role(_business,'position_entry_person')
    OR public.has_business_access_role(_business,'legacy_staff');
  IF NOT public.has_business_role(_business,'accountant')
     AND NOT (public.has_permission(_business,'customers.view') AND has_sales_role) THEN
    RAISE EXCEPTION 'Loyalty access denied';
  END IF;
  IF n IS NULL THEN RETURN 0; END IF;
  SELECT id INTO m FROM public.customer_memberships
  WHERE business_id=_business AND mobile=n;
  IF m IS NULL THEN RETURN 0; END IF;
  RETURN public.loyalty_balance(_business,m);
END;
$loyalty_access$;
REVOKE ALL ON FUNCTION public.loyalty_available_points(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.loyalty_available_points(uuid,text) TO authenticated,service_role;

