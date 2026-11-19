-- 0101: make the selected employee position the default access bundle.
-- Existing custom/additional roles remain additive and branch assignments remain independent.

CREATE OR REPLACE FUNCTION public.sync_default_business_access_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role_id uuid;
  v_role_code text;
BEGIN
  IF current_setting('bizsathi.skip_access_role_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_auraluxe_workspace(NEW.business_id) THEN
    RETURN NEW;
  END IF;

  v_role_code := CASE
    WHEN NEW.job_title IS NOT NULL THEN 'position_' || NEW.job_title
    ELSE 'legacy_' || NEW.role_code
  END;

  SELECT r.id INTO v_role_id
  FROM public.business_access_roles r
  WHERE r.business_id = NEW.business_id
    AND r.code = v_role_code
    AND r.is_active;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Default access bundle is not configured for position/access role %', v_role_code;
  END IF;

  DELETE FROM public.business_member_access_roles
  WHERE business_id = NEW.business_id
    AND user_id = NEW.user_id
    AND is_default;

  INSERT INTO public.business_member_access_roles
    (business_id, user_id, role_id, assigned_by, is_default)
  VALUES
    (NEW.business_id, NEW.user_id, v_role_id, COALESCE(auth.uid(), NEW.invited_by), true)
  ON CONFLICT (business_id, user_id, role_id)
  DO UPDATE SET
    is_default = true,
    assigned_by = EXCLUDED.assigned_by,
    assigned_at = now();

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_default_business_access_role() FROM PUBLIC, anon, authenticated;

-- Position bundles are system-managed and cannot be manually assigned or removed.
CREATE OR REPLACE FUNCTION public.guard_position_access_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_code text;
BEGIN
  SELECT r.code INTO v_code
  FROM public.business_access_roles r
  WHERE r.business_id = NEW.business_id
    AND r.id = NEW.role_id;

  IF v_code LIKE 'position_%' AND NOT NEW.is_default THEN
    RAISE EXCEPTION 'Position access bundles are managed by the employee position. Change the employee position instead.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_position_access_role_assignment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_position_access_role_assignment ON public.business_member_access_roles;
CREATE TRIGGER guard_position_access_role_assignment
BEFORE INSERT OR UPDATE OF role_id, is_default
ON public.business_member_access_roles
FOR EACH ROW
EXECUTE FUNCTION public.guard_position_access_role_assignment();

-- Position changes also set the matching authority tier. Additional custom roles
-- remain assigned; the default position bundle is replaced by the membership trigger.
CREATE OR REPLACE FUNCTION public.set_member_job_title(_business uuid, _user uuid, _title text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  actor_rank smallint;
  target_rank smallint;
  new_role text;
  new_role_rank smallint;
  is_branch_manager boolean;
  current_status text;
  old_role text;
BEGIN
  actor_rank := public.business_role_rank(_business, auth.uid());
  target_rank := public.business_role_rank(_business, _user);
  new_role := public.job_title_role(_title);

  is_branch_manager := actor_rank >= 50 AND (
    public.has_business_access_role(_business, 'position_branch_manager')
    OR public.has_business_access_role(_business, 'legacy_branch_manager')
  );

  IF auth.uid() IS NULL OR actor_rank IS NULL OR actor_rank < 1
     OR _user = auth.uid() OR target_rank IS NULL OR target_rank >= actor_rank
     OR (actor_rank < 80 AND NOT is_branch_manager) THEN
    RAISE EXCEPTION 'Not authorized to change this employee position' USING ERRCODE = '42501';
  END IF;

  IF new_role IS NULL THEN
    RAISE EXCEPTION 'Choose a valid employee position';
  END IF;

  SELECT r.rank INTO new_role_rank
  FROM public.roles r
  WHERE r.code = new_role;

  IF new_role_rank IS NULL OR new_role_rank >= actor_rank THEN
    RAISE EXCEPTION 'The selected position would exceed your authority' USING ERRCODE = '42501';
  END IF;

  IF actor_rank < 80 AND _title NOT IN ('department_manager', 'sales_person', 'stock_manager', 'entry_person') THEN
    RAISE EXCEPTION 'Branch Managers may assign only Department Manager, Cashier, Inventory Manager or Store Assistant positions' USING ERRCODE = '42501';
  END IF;

  IF actor_rank < 80 AND EXISTS (
    SELECT 1
    FROM public.business_member_access_roles a
    JOIN public.business_access_roles r
      ON r.business_id = a.business_id AND r.id = a.role_id
    WHERE a.business_id = _business AND a.user_id = _user
      AND r.code IN ('position_branch_manager', 'legacy_branch_manager')
  ) THEN
    RAISE EXCEPTION 'Branch Managers cannot change another Branch Manager position' USING ERRCODE = '42501';
  END IF;

  IF actor_rank < 80 AND (
    (SELECT count(*) FROM public.branch_memberships bm
     WHERE bm.business_id = _business AND bm.user_id = _user) <> 1
    OR NOT EXISTS (
      SELECT 1
      FROM public.branch_memberships actor_bm
      JOIN public.branch_memberships target_bm
        ON target_bm.business_id = actor_bm.business_id
       AND target_bm.branch_id = actor_bm.branch_id
      WHERE actor_bm.business_id = _business AND actor_bm.user_id = auth.uid()
        AND target_bm.user_id = _user
    )
  ) THEN
    RAISE EXCEPTION 'Branch Managers can change positions only for employees whose sole branch is assigned to them' USING ERRCODE = '42501';
  END IF;

  SELECT status, role_code INTO current_status, old_role
  FROM public.business_memberships
  WHERE business_id = _business AND user_id = _user
  FOR UPDATE;

  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  UPDATE public.business_memberships
  SET job_title = _title,
      role_code = new_role
  WHERE business_id = _business AND user_id = _user;

  PERFORM public.write_audit(
    _business,
    'employee.position_access.update',
    'business_memberships',
    _user::text,
    jsonb_build_object('position', NULL, 'authority_role', old_role),
    jsonb_build_object('position', _title, 'authority_role', new_role, 'branch_manager_scope', actor_rank < 80)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_member_job_title(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_job_title(uuid, uuid, text) TO authenticated;

-- Position template edits now update the actual system position bundle.
CREATE OR REPLACE FUNCTION public.set_role_template(_business uuid, _title text, _denied text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_denied text[] := ARRAY(
    SELECT DISTINCT p FROM unnest(COALESCE(_denied, '{}')) p ORDER BY p
  );
  v_role_id uuid;
BEGIN
  IF COALESCE(public.business_role_rank(_business, auth.uid()), 0) < 100 THEN
    RAISE EXCEPTION 'Only the business owner can change position permissions' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.job_title_denials WHERE job_title = _title) THEN
    RAISE EXCEPTION 'Unknown position';
  END IF;
  IF cardinality(v_denied) > 80 OR EXISTS (
    SELECT 1 FROM unnest(v_denied) p
    WHERE NOT EXISTS (SELECT 1 FROM public.business_permission_catalog c WHERE c.permission = p)
  ) THEN
    RAISE EXCEPTION 'Unknown or too many permission restrictions';
  END IF;

  IF _title = 'branch_manager' AND EXISTS (
    SELECT 1 FROM public.job_title_denials d
    WHERE d.job_title = 'branch_manager'
      AND NOT (d.permission = ANY(v_denied))
  ) THEN
    RAISE EXCEPTION 'Branch Manager permissions cannot exceed the fixed branch-only ceiling' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_role_id
  FROM public.business_access_roles
  WHERE business_id = _business
    AND code = 'position_' || _title
    AND is_active;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Position access bundle is not configured';
  END IF;

  INSERT INTO public.business_role_templates
    (business_id, job_title, denied_permissions, updated_by, updated_at)
  VALUES (_business, _title, v_denied, auth.uid(), now())
  ON CONFLICT (business_id, job_title)
  DO UPDATE SET
    denied_permissions = EXCLUDED.denied_permissions,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  DELETE FROM public.business_access_role_permissions
  WHERE business_id = _business AND role_id = v_role_id;

  INSERT INTO public.business_access_role_permissions (business_id, role_id, permission)
  SELECT _business, v_role_id, c.permission
  FROM public.business_permission_catalog c
  WHERE NOT (c.permission = ANY(v_denied));

  PERFORM public.write_audit(
    _business,
    'position_permissions.update',
    'business_role_templates',
    _title,
    NULL,
    jsonb_build_object('denied_permissions', to_jsonb(v_denied))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_role_template(uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_role_template(uuid, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_role_template(_business uuid, _title text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role_id uuid;
BEGIN
  IF COALESCE(public.business_role_rank(_business, auth.uid()), 0) < 100 THEN
    RAISE EXCEPTION 'Only the business owner can reset position permissions' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.job_title_denials WHERE job_title = _title) THEN
    RAISE EXCEPTION 'Unknown position';
  END IF;

  SELECT id INTO v_role_id
  FROM public.business_access_roles
  WHERE business_id = _business
    AND code = 'position_' || _title
    AND is_active;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Position access bundle is not configured';
  END IF;

  DELETE FROM public.business_role_templates
  WHERE business_id = _business AND job_title = _title;

  DELETE FROM public.business_access_role_permissions
  WHERE business_id = _business AND role_id = v_role_id;

  INSERT INTO public.business_access_role_permissions (business_id, role_id, permission)
  SELECT _business, v_role_id, c.permission
  FROM public.business_permission_catalog c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.job_title_denials d
    WHERE d.job_title = _title AND d.permission = c.permission
  );

  PERFORM public.write_audit(
    _business,
    'position_permissions.reset',
    'business_role_templates',
    _title,
    NULL,
    NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_role_template(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_role_template(uuid, text) TO authenticated;

-- Backfill the default access bundle for any existing member with a saved position.
UPDATE public.business_memberships
SET role_code = public.job_title_role(job_title)
WHERE business_id = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'
  AND job_title IS NOT NULL
  AND role_code IS DISTINCT FROM public.job_title_role(job_title);
