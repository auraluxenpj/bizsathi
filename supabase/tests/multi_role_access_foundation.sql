-- Run on an isolated database after all project migrations are applied.
-- All fixture writes are rolled back; validates multi-role permission and branch behavior.
BEGIN;
DO $tests$
DECLARE
  owner_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  v_business_id uuid;
  branch_a uuid;
  branch_b uuid;
  custom_role_id uuid;
  branch_manager_role_id uuid;
  accountant_role_id uuid;
  invitation_id uuid;
  owner_default text;
  staff_default text;
  assignments integer;
  role_list jsonb;
  assignment_list jsonb;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at)
  VALUES
    (owner_id,'multi-role-owner@example.invalid',now()),
    (staff_id,'multi-role-staff@example.invalid',now());

  INSERT INTO public.businesses(name,created_by)
  VALUES ('Multi-role access foundation test',owner_id)
  RETURNING id INTO v_business_id;

  INSERT INTO public.branches(business_id,code,name)
  VALUES (v_business_id,'A','Assigned branch') RETURNING id INTO branch_a;
  INSERT INTO public.branches(business_id,code,name)
  VALUES (v_business_id,'B','Unassigned branch') RETURNING id INTO branch_b;

  INSERT INTO public.business_memberships(business_id,user_id,role_code,job_title)
  VALUES
    (v_business_id,owner_id,'owner',NULL),
    (v_business_id,staff_id,'staff','sales_person');

  SELECT r.code INTO owner_default
  FROM public.business_member_access_roles a
  JOIN public.business_access_roles r ON r.business_id=a.business_id AND r.id=a.role_id
  WHERE a.business_id=v_business_id AND a.user_id=owner_id AND a.is_default;

  SELECT r.code INTO staff_default
  FROM public.business_member_access_roles a
  JOIN public.business_access_roles r ON r.business_id=a.business_id AND r.id=a.role_id
  WHERE a.business_id=v_business_id AND a.user_id=staff_id AND a.is_default;

  ASSERT owner_default='legacy_owner','Owner gets the compatibility permission bundle';
  ASSERT staff_default='legacy_staff','Base Staff access grants the restricted POS permission bundle independently of HR position';
  ASSERT EXISTS (
    SELECT 1 FROM public.business_access_role_permissions rp
    JOIN public.business_access_roles r ON r.id=rp.role_id AND r.business_id=rp.business_id
    WHERE r.business_id=v_business_id AND r.code='legacy_staff' AND rp.permission='sales.create'
  ),'Sales Person default grants sale creation';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.business_access_role_permissions rp
    JOIN public.business_access_roles r ON r.id=rp.role_id AND r.business_id=rp.business_id
    WHERE r.business_id=v_business_id AND r.code='legacy_staff' AND rp.permission='settings.delete_business'
  ),'Sales Person default does not grant destructive business settings';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM public.update_business_member(v_business_id,staff_id,'viewer','active');
  RESET ROLE;
  SELECT r.code INTO staff_default
  FROM public.business_member_access_roles a
  JOIN public.business_access_roles r ON r.business_id=a.business_id AND r.id=a.role_id
  WHERE a.business_id=v_business_id AND a.user_id=staff_id AND a.is_default;
  ASSERT staff_default='legacy_viewer','Changing base access updates the default permission bundle';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM public.update_business_member(v_business_id,staff_id,'staff','active');
  RESET ROLE;
  SELECT r.code INTO staff_default
  FROM public.business_member_access_roles a
  JOIN public.business_access_roles r ON r.business_id=a.business_id AND r.id=a.role_id
  WHERE a.business_id=v_business_id AND a.user_id=staff_id AND a.is_default;
  ASSERT staff_default='legacy_staff','Restoring Staff restores the POS-only permission bundle';

  ASSERT (SELECT count(*) FROM public.business_permission_catalog)>=77,
    'Canonical permission catalogue includes application permissions';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  invitation_id := public.create_team_invitation(
    v_business_id,branch_a,'staff','accountant',ARRAY[]::text[],
    'newhire@example.invalid','9800000000',repeat('a',64),now()+interval '7 days',1,'Role and position separation test'
  );
  ASSERT EXISTS (
    SELECT 1 FROM public.team_invitations
    WHERE id=invitation_id AND role_code='staff' AND job_title='accountant'
  ),'Invitation authority role and HR position can be selected independently';
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  custom_role_id := public.create_business_access_role(
    v_business_id,'Stock + Purchase','Custom combined duties',1::smallint,ARRAY['purchases.view','inventory.view']
  );
  PERFORM public.update_business_access_role(v_business_id,custom_role_id,'Stock + Purchase Revised','Updated custom role',ARRAY['purchases.view','inventory.view']);
  PERFORM public.assign_business_access_role(v_business_id,staff_id,custom_role_id);
  role_list := public.get_business_access_roles(v_business_id);
  assignment_list := public.get_business_member_access_roles(v_business_id);
  ASSERT role_list @> jsonb_build_array(jsonb_build_object('id',custom_role_id,'name','Stock + Purchase Revised')),
    'Administrator can list custom role definitions';
  ASSERT assignment_list @> jsonb_build_array(jsonb_build_object('userId',staff_id,'roleId',custom_role_id)),
    'Administrator can list employee role assignments';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.member_role_denials(v_business_id) d
    WHERE d.user_id=staff_id AND d.permission='purchases.view'
  ),'Role denials reflect the union of assigned permission bundles';
  RESET ROLE;

  SELECT count(*) INTO assignments FROM public.business_member_access_roles
  WHERE business_id=v_business_id AND user_id=staff_id;
  ASSERT assignments=2,'An employee can hold more than one business role';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',staff_id,'role','authenticated')::text,true);
  ASSERT public.has_permission(v_business_id,'sales.create'),'The employee retains their original permission';
  ASSERT public.has_permission(v_business_id,'purchases.view'),'The additional role adds its permission';
  ASSERT NOT public.has_permission(v_business_id,'settings.delete_business'),'The combined roles do not grant unrelated destructive permissions';
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM public.set_member_permissions(v_business_id,staff_id,ARRAY['purchases.view','hr.self.view']);
  PERFORM public.set_member_job_title(v_business_id,staff_id,'stock_manager');
  RESET ROLE;
  SELECT id INTO branch_manager_role_id FROM public.business_access_roles
  WHERE business_id=v_business_id AND code='legacy_branch_manager';
  SELECT id INTO accountant_role_id FROM public.business_access_roles
  WHERE business_id=v_business_id AND code='legacy_accountant';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM public.assign_business_access_role(v_business_id,staff_id,branch_manager_role_id);
  PERFORM public.assign_business_access_role(v_business_id,staff_id,accountant_role_id);
  PERFORM public.set_branch_access(v_business_id,branch_a,staff_id,true);
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',staff_id,'role','authenticated')::text,true);
  ASSERT NOT public.has_permission(v_business_id,'purchases.view'),'An explicit employee denial overrides grants from every role';
  ASSERT public.has_permission(v_business_id,'sales.create'),'The employee keeps permissions granted by the default role';
  ASSERT public.business_role_rank(v_business_id,staff_id)=60,'Built-in access roles contribute their authority rank';
  ASSERT public.can_access_branch(v_business_id,branch_a),'The explicitly assigned branch remains accessible';
  ASSERT NOT public.can_access_branch(v_business_id,branch_b),'A role does not grant access to an unassigned branch';
  ASSERT public.can_approve_inventory_count(v_business_id,branch_a),'Assigned Branch Manager role can approve counts in its branch';
  ASSERT NOT public.can_approve_inventory_count(v_business_id,branch_b),'Branch Manager cannot approve counts in another branch';
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM public.unassign_business_access_role(v_business_id,staff_id,custom_role_id);
  PERFORM public.unassign_business_access_role(v_business_id,staff_id,branch_manager_role_id);
  PERFORM public.unassign_business_access_role(v_business_id,staff_id,accountant_role_id);
  RESET ROLE;

  SELECT count(*) INTO assignments FROM public.business_member_access_roles
  WHERE business_id=v_business_id AND user_id=staff_id;
  ASSERT assignments=1,'Removing additional roles preserves the default compatibility role';
  ASSERT (
    SELECT r.code FROM public.business_member_access_roles a
    JOIN public.business_access_roles r ON r.id=a.role_id AND r.business_id=a.business_id
    WHERE a.business_id=v_business_id AND a.user_id=staff_id AND a.is_default
  )='legacy_staff','Changing an HR designation does not silently change the base access role';
  ASSERT public.business_role_rank(v_business_id,staff_id)=40,'Removing added roles restores the original security rank';
  ASSERT (SELECT count(*) FROM public.branch_memberships WHERE business_id=v_business_id)=1,
    'Role changes preserve the employee branch assignment';
  ASSERT (SELECT count(*) FROM public.business_memberships WHERE business_id=v_business_id)=2,
    'Original business memberships remain intact';

  RAISE NOTICE 'MULTI_ROLE_ACCESS_FOUNDATION_TESTS_PASSED';
END
$tests$;
ROLLBACK;
