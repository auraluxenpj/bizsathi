-- 0076: activate multi-role permission resolution and keep HR positions separate.
-- This is additive and retains the existing membership role_code as the authority rank.
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
  IF current_setting('bizsathi.skip_access_role_sync',true)='on' THEN RETURN NEW; END IF;
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
      AND NOT EXISTS (
        SELECT 1 FROM public.business_memberships m
        WHERE m.business_id=_business AND m.user_id=auth.uid()
          AND m.status='active' AND m.role_code='branch_manager'
          AND m.job_title IS DISTINCT FROM 'branch_manager'
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.business_memberships m
          WHERE m.business_id=_business AND m.user_id=auth.uid()
            AND m.status='active' AND m.role_code='branch_manager'
        )
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

