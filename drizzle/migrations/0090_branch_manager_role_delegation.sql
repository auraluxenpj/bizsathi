-- 0090: branch-manager operational delegation and department-manager designation.
-- Branch Managers can manage role assignments only for employees whose sole branch
-- is one of the manager's assigned branches. Role templates remain business-admin owned.
-- Existing memberships, branch grants, role assignments and employee records are preserved.

ALTER TABLE public.business_memberships
  DROP CONSTRAINT IF EXISTS business_memberships_job_title_check;
ALTER TABLE public.business_memberships
  ADD CONSTRAINT business_memberships_job_title_check
  CHECK (job_title IS NULL OR job_title IN
    ('partner','manager','branch_manager','accountant','department_manager','sales_person','stock_manager','entry_person'));

ALTER TABLE public.business_invitations
  DROP CONSTRAINT IF EXISTS business_invitations_job_title_check;
ALTER TABLE public.business_invitations
  ADD CONSTRAINT business_invitations_job_title_check
  CHECK (job_title IS NULL OR job_title IN
    ('partner','manager','branch_manager','accountant','department_manager','sales_person','stock_manager','entry_person'));

ALTER TABLE public.business_role_templates
  DROP CONSTRAINT IF EXISTS business_role_templates_job_title_check;
ALTER TABLE public.business_role_templates
  ADD CONSTRAINT business_role_templates_job_title_check
  CHECK (job_title IN ('partner','manager','branch_manager','accountant','department_manager','sales_person','stock_manager','entry_person'));

ALTER TABLE public.team_invitations
  DROP CONSTRAINT IF EXISTS team_invitations_job_title_check;
ALTER TABLE public.team_invitations
  ADD CONSTRAINT team_invitations_job_title_check
  CHECK (job_title IS NULL OR job_title IN
    ('partner','manager','branch_manager','accountant','department_manager','sales_person','stock_manager','entry_person'));

CREATE OR REPLACE FUNCTION public.job_title_role(_title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _title
    WHEN 'partner' THEN 'admin'
    WHEN 'manager' THEN 'accountant'
    WHEN 'branch_manager' THEN 'branch_manager'
    WHEN 'accountant' THEN 'accountant'
    WHEN 'department_manager' THEN 'staff'
    WHEN 'sales_person' THEN 'staff'
    WHEN 'stock_manager' THEN 'staff'
    WHEN 'entry_person' THEN 'staff'
  END
$$;

-- Department Manager is a non-authority HR designation. Its permission preset is
-- operational only; it never inherits Branch Manager or Administrator authority.
INSERT INTO public.job_title_denials(job_title,permission)
SELECT 'department_manager',p.permission
FROM public.business_permission_catalog p
WHERE p.permission <> ALL (ARRAY[
  'sales.create','sales.view','sales.edit',
  'inventory.view','categories.view','stock.create','stock.edit',
  'customers.create','customers.edit','customers.view',
  'suppliers.view','reports.home_stats','reports.items','staff.view','hr.self.view','hr.attendance.view','hr.leave.view','hr.leave.create','hr.shifts.view'
]::text[])
ON CONFLICT (job_title,permission) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_department_manager_access_role(_business uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $seed_department_manager_access_role$
DECLARE v_role_id uuid;
BEGIN
  INSERT INTO public.business_access_roles
    (business_id,code,name,description,authority_rank,is_system,is_active)
  VALUES
    (_business,'position_department_manager','Department Manager',
     'Operational position only; no branch-management or business-administration authority.',
     1,true,true)
  ON CONFLICT (business_id,code) DO UPDATE
    SET name=EXCLUDED.name,description=EXCLUDED.description,is_system=true
  RETURNING id INTO v_role_id;

  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM public.business_access_roles
    WHERE business_id=_business AND code='position_department_manager' AND is_active;
  END IF;

  DELETE FROM public.business_access_role_permissions
  WHERE business_id=_business AND role_id=v_role_id;

  INSERT INTO public.business_access_role_permissions(business_id,role_id,permission)
  SELECT _business,v_role_id,p.permission
  FROM public.business_permission_catalog p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.job_title_denials d
    WHERE d.job_title='department_manager' AND d.permission=p.permission
  )
  ON CONFLICT DO NOTHING;
END;
$seed_department_manager_access_role$;
REVOKE ALL ON FUNCTION public.seed_department_manager_access_role(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.seed_department_manager_access_role_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_department_manager_access_role(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_department_manager_access_role_on_insert() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS seed_department_manager_access_role_after_insert ON public.businesses;
CREATE TRIGGER seed_department_manager_access_role_after_insert
AFTER INSERT ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.seed_department_manager_access_role_on_insert();

DO $seed_existing_department_manager_roles$
DECLARE b record;
BEGIN
  FOR b IN SELECT id FROM public.businesses WHERE archived_at IS NULL LOOP
    PERFORM public.seed_department_manager_access_role(b.id);
  END LOOP;
END;
$seed_existing_department_manager_roles$;


-- Keep the Branch Manager's database permission ceiling aligned with the approved
-- operational preset, including personal HR workspace, attendance, leave and shifts.
CREATE OR REPLACE FUNCTION public.has_permission(_business uuid,_perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $branch_manager_permission_ceiling$
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
          'hr.self.view','hr.attendance.view','hr.leave.view','hr.leave.create','hr.shifts.view',
          'sales.view','sales.create','expenses.view','inventory.view','categories.view',
          'stock.create','stock.edit','customers.create','customers.edit','customers.view',
          'suppliers.view','staff.view','reports.view','reports.home_stats','reports.expenses',
          'reports.items','reports.parties','reports.transactions'
        ]::text[])
      )
    )
$branch_manager_permission_ceiling$;
REVOKE ALL ON FUNCTION public.has_permission(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid,text) TO authenticated;

-- Business administrators see all business roles. Branch Managers see only roles
-- strictly below their authority whose every permission they personally hold.
CREATE OR REPLACE FUNCTION public.get_business_access_roles(_business uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $get_business_access_roles$
DECLARE
  result jsonb;
  actor_rank smallint;
  is_branch_manager boolean;
BEGIN
  actor_rank := COALESCE(public.business_role_rank(_business,auth.uid()),0);
  is_branch_manager := public.has_business_access_role(_business,'position_branch_manager')
    OR public.has_business_access_role(_business,'legacy_branch_manager');
  IF actor_rank<80 AND NOT is_branch_manager THEN
    RAISE EXCEPTION 'Administrator or Branch Manager access is required' USING ERRCODE='42501';
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
  WHERE r.business_id=_business
    AND (
      actor_rank>=80
      OR (
        is_branch_manager
        AND r.is_active
        AND r.authority_rank<actor_rank
        AND r.code NOT IN ('legacy_owner','legacy_admin','legacy_accountant','legacy_branch_manager',
                           'position_partner','position_accountant','position_branch_manager')
        AND NOT EXISTS (
          SELECT 1 FROM public.business_access_role_permissions rp
          WHERE rp.business_id=r.business_id AND rp.role_id=r.id
            AND NOT public.has_permission(_business,rp.permission)
        )
      )
    );
  RETURN result;
END;
$get_business_access_roles$;
REVOKE ALL ON FUNCTION public.get_business_access_roles(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_business_access_roles(uuid) TO authenticated;

-- Branch Managers can inspect assignments only for employees whose sole branch is
-- one of their own assigned branches. Business administrators retain the full view.
CREATE OR REPLACE FUNCTION public.get_business_member_access_roles(_business uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $member_access_roles$
DECLARE
  result jsonb;
  actor_rank smallint;
  is_branch_manager boolean;
BEGIN
  actor_rank := COALESCE(public.business_role_rank(_business,auth.uid()),0);
  is_branch_manager := public.has_business_access_role(_business,'position_branch_manager')
    OR public.has_business_access_role(_business,'legacy_branch_manager');
  IF actor_rank<80 AND NOT is_branch_manager THEN
    RAISE EXCEPTION 'Administrator or Branch Manager access is required' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'userId',a.user_id,'roleId',r.id,'roleCode',r.code,'roleName',r.name,
    'authorityRank',r.authority_rank,'isDefault',a.is_default,'assignedAt',a.assigned_at
  ) ORDER BY a.user_id,r.name),'[]'::jsonb)
  INTO result
  FROM public.business_member_access_roles a
  JOIN public.business_access_roles r
    ON r.business_id=a.business_id AND r.id=a.role_id
  JOIN public.business_memberships m
    ON m.business_id=a.business_id AND m.user_id=a.user_id
  WHERE a.business_id=_business AND m.status='active'
    AND (
      actor_rank>=80
      OR (
        is_branch_manager
        AND (SELECT count(*) FROM public.branch_memberships target_bm
             WHERE target_bm.business_id=_business AND target_bm.user_id=a.user_id)=1
        AND EXISTS (
          SELECT 1
          FROM public.branch_memberships actor_bm
          JOIN public.branch_memberships target_bm
            ON target_bm.business_id=actor_bm.business_id
           AND target_bm.branch_id=actor_bm.branch_id
          WHERE actor_bm.business_id=_business AND actor_bm.user_id=auth.uid()
            AND target_bm.user_id=a.user_id
        )
      )
    );
  RETURN result;
END;
$member_access_roles$;
REVOKE ALL ON FUNCTION public.get_business_member_access_roles(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_business_member_access_roles(uuid) TO authenticated;

-- Additional roles are business-scoped in the current schema. Therefore a Branch
-- Manager may assign/remove them only when the employee has exactly one branch and
-- that branch is also assigned to the acting manager. Permission grants must be a
-- subset of the manager's effective permissions.
CREATE OR REPLACE FUNCTION public.assign_business_access_role(_business uuid,_user uuid,_role uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $assign_business_access_role$
DECLARE
  actor_rank smallint;
  target_rank smallint;
  role_rank smallint;
  is_branch_manager boolean;
  p text;
BEGIN
  actor_rank := public.business_role_rank(_business,auth.uid());
  target_rank := public.business_role_rank(_business,_user);
  is_branch_manager := public.has_business_access_role(_business,'position_branch_manager')
    OR public.has_business_access_role(_business,'legacy_branch_manager');

  IF auth.uid() IS NULL OR actor_rank IS NULL OR _user=auth.uid()
     OR target_rank IS NULL OR target_rank>=actor_rank
     OR (actor_rank<80 AND NOT is_branch_manager) THEN
    RAISE EXCEPTION 'Not authorized to assign roles to this employee' USING ERRCODE='42501';
  END IF;

  IF actor_rank<80 AND (
    (SELECT count(*) FROM public.branch_memberships bm
     WHERE bm.business_id=_business AND bm.user_id=_user)<>1
    OR NOT EXISTS (
      SELECT 1 FROM public.branch_memberships actor_bm
      JOIN public.branch_memberships target_bm
        ON target_bm.business_id=actor_bm.business_id
       AND target_bm.branch_id=actor_bm.branch_id
      WHERE actor_bm.business_id=_business AND actor_bm.user_id=auth.uid()
        AND target_bm.user_id=_user
    )
  ) THEN
    RAISE EXCEPTION 'Branch Managers can assign roles only to employees whose sole branch is assigned to them' USING ERRCODE='42501';
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
    jsonb_build_object('role_id',_role,'branch_manager_scope',actor_rank<80));
END;
$assign_business_access_role$;
REVOKE ALL ON FUNCTION public.assign_business_access_role(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_business_access_role(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unassign_business_access_role(_business uuid,_user uuid,_role uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $unassign_business_access_role$
DECLARE
  actor_rank smallint;
  target_rank smallint;
  assignment_count integer;
  is_branch_manager boolean;
BEGIN
  actor_rank := public.business_role_rank(_business,auth.uid());
  target_rank := public.business_role_rank(_business,_user);
  is_branch_manager := public.has_business_access_role(_business,'position_branch_manager')
    OR public.has_business_access_role(_business,'legacy_branch_manager');

  IF auth.uid() IS NULL OR actor_rank IS NULL OR _user=auth.uid()
     OR target_rank IS NULL OR target_rank>=actor_rank
     OR (actor_rank<80 AND NOT is_branch_manager) THEN
    RAISE EXCEPTION 'Not authorized to change roles for this employee' USING ERRCODE='42501';
  END IF;

  IF actor_rank<80 AND (
    (SELECT count(*) FROM public.branch_memberships bm
     WHERE bm.business_id=_business AND bm.user_id=_user)<>1
    OR NOT EXISTS (
      SELECT 1 FROM public.branch_memberships actor_bm
      JOIN public.branch_memberships target_bm
        ON target_bm.business_id=actor_bm.business_id
       AND target_bm.branch_id=actor_bm.branch_id
      WHERE actor_bm.business_id=_business AND actor_bm.user_id=auth.uid()
        AND target_bm.user_id=_user
    )
  ) THEN
    RAISE EXCEPTION 'Branch Managers can change roles only for employees whose sole branch is assigned to them' USING ERRCODE='42501';
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
    jsonb_build_object('role_id',_role,'branch_manager_scope',actor_rank<80));
END;
$unassign_business_access_role$;
REVOKE ALL ON FUNCTION public.unassign_business_access_role(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.unassign_business_access_role(uuid,uuid,uuid) TO authenticated;

-- HR position changes are branch-scoped for Branch Managers. They may not assign
-- owner, administrator, accountant or another Branch Manager designation.
CREATE OR REPLACE FUNCTION public.set_member_job_title(_business uuid,_user uuid,_title text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $set_member_job_title$
DECLARE
  actor_rank smallint;
  target_rank smallint;
  is_branch_manager boolean;
  current_status text;
BEGIN
  actor_rank := public.business_role_rank(_business,auth.uid());
  target_rank := public.business_role_rank(_business,_user);
  is_branch_manager := public.has_business_access_role(_business,'position_branch_manager')
    OR public.has_business_access_role(_business,'legacy_branch_manager');

  IF auth.uid() IS NULL OR actor_rank IS NULL OR _user=auth.uid()
     OR target_rank IS NULL OR target_rank>=actor_rank
     OR (actor_rank<80 AND NOT is_branch_manager) THEN
    RAISE EXCEPTION 'Not authorized to change this employee designation' USING ERRCODE='42501';
  END IF;
  IF _title IS NOT NULL AND public.job_title_role(_title) IS NULL THEN
    RAISE EXCEPTION 'Unknown position';
  END IF;
  IF actor_rank<80 AND _title NOT IN ('department_manager','sales_person','stock_manager','entry_person') THEN
    RAISE EXCEPTION 'Branch Managers may assign only Department Manager, Cashier, Inventory Manager or Staff positions' USING ERRCODE='42501';
  END IF;
  IF actor_rank<80 AND (
    (SELECT count(*) FROM public.branch_memberships bm
     WHERE bm.business_id=_business AND bm.user_id=_user)<>1
    OR NOT EXISTS (
      SELECT 1 FROM public.branch_memberships actor_bm
      JOIN public.branch_memberships target_bm
        ON target_bm.business_id=actor_bm.business_id
       AND target_bm.branch_id=actor_bm.branch_id
      WHERE actor_bm.business_id=_business AND actor_bm.user_id=auth.uid()
        AND target_bm.user_id=_user
    )
  ) THEN
    RAISE EXCEPTION 'Branch Managers can change positions only for employees whose sole branch is assigned to them' USING ERRCODE='42501';
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
    NULL,jsonb_build_object('title',_title,'branch_manager_scope',actor_rank<80));
END;
$set_member_job_title$;
REVOKE ALL ON FUNCTION public.set_member_job_title(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_member_job_title(uuid,uuid,text) TO authenticated;


-- Branch Manager team view: return only active employees whose sole branch is
-- assigned to the caller. This avoids exposing or mutating cross-branch memberships.
CREATE OR REPLACE FUNCTION public.get_branch_manager_team_access(_business uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $branch_manager_team_access$
DECLARE
  result jsonb;
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR NOT (
    public.has_business_access_role(_business,'position_branch_manager')
    OR public.has_business_access_role(_business,'legacy_branch_manager')
  ) THEN
    RAISE EXCEPTION 'Branch Manager access is required' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'branches',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'code',b.code,'is_active',b.is_active,'address',b.address) ORDER BY b.name)
      FROM public.branches b
      JOIN public.branch_memberships own_bm
        ON own_bm.business_id=b.business_id AND own_bm.branch_id=b.id
      WHERE b.business_id=_business AND own_bm.user_id=actor AND b.is_active
    ),'[]'::jsonb),
    'members',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id',m.user_id,'role_code',m.role_code,'job_title',m.job_title,'status',m.status,
        'profiles',jsonb_build_object('full_name',p.full_name,'phone',p.phone)
      ) ORDER BY p.full_name)
      FROM public.business_memberships m
      JOIN public.branch_memberships target_bm
        ON target_bm.business_id=m.business_id AND target_bm.user_id=m.user_id
      JOIN public.profiles p ON p.id=m.user_id
      WHERE m.business_id=_business AND m.status='active' AND m.user_id<>actor
        AND target_bm.branch_id IN (
          SELECT own_bm.branch_id FROM public.branch_memberships own_bm
          WHERE own_bm.business_id=_business AND own_bm.user_id=actor
        )
        AND (SELECT count(*) FROM public.branch_memberships only_bm
             WHERE only_bm.business_id=_business AND only_bm.user_id=m.user_id)=1
    ),'[]'::jsonb),
    'branchAccess',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('user_id',bm.user_id,'branch_id',bm.branch_id))
      FROM public.branch_memberships bm
      JOIN public.business_memberships m
        ON m.business_id=bm.business_id AND m.user_id=bm.user_id AND m.status='active'
      WHERE bm.business_id=_business
        AND bm.branch_id IN (
          SELECT own_bm.branch_id FROM public.branch_memberships own_bm
          WHERE own_bm.business_id=_business AND own_bm.user_id=actor
        )
        AND (SELECT count(*) FROM public.branch_memberships only_bm
             WHERE only_bm.business_id=_business AND only_bm.user_id=bm.user_id)=1
    ),'[]'::jsonb),
    'memberRoles',public.get_business_member_access_roles(_business)
  ) INTO result;
  RETURN result;
END;
$branch_manager_team_access$;
REVOKE ALL ON FUNCTION public.get_branch_manager_team_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_branch_manager_team_access(uuid) TO authenticated;


-- Branch Managers can review only the audit events they personally generated.
DROP POLICY IF EXISTS audit_select_branch_manager_self ON public.audit_logs;
CREATE POLICY audit_select_branch_manager_self ON public.audit_logs
FOR SELECT TO authenticated
USING (
  actor_id=auth.uid()
  AND (
    public.has_business_access_role(business_id,'position_branch_manager')
    OR public.has_business_access_role(business_id,'legacy_branch_manager')
  )
);

COMMENT ON FUNCTION public.assign_business_access_role(uuid,uuid,uuid) IS
  'Business admins manage business role assignments; Branch Managers may assign permission-subset roles only to employees with one shared branch.';
COMMENT ON FUNCTION public.set_member_job_title(uuid,uuid,text) IS
  'Business admins or Branch Managers may update HR positions; Branch Manager changes are branch-scoped and cannot assign management authority.';
