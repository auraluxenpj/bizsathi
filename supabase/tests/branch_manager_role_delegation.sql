-- Run on an isolated database after all project migrations are applied.
-- Validates Branch Manager branch isolation, role ceilings and Department Manager separation.
BEGIN;
DO $tests$
DECLARE
  owner_id uuid := gen_random_uuid();
  branch_manager_id uuid := gen_random_uuid();
  cashier_id uuid := gen_random_uuid();
  department_manager_id uuid := gen_random_uuid();
  multi_branch_staff_id uuid := gen_random_uuid();
  v_business uuid;
  branch_a uuid;
  branch_b uuid;
  department_manager_role uuid;
  branch_manager_role uuid;
  team jsonb;
  roles jsonb;
  assignments jsonb;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at)
  VALUES
    (owner_id,'branch-role-owner@example.invalid',now()),
    (branch_manager_id,'branch-role-manager@example.invalid',now()),
    (cashier_id,'branch-role-cashier@example.invalid',now()),
    (department_manager_id,'branch-role-department-manager@example.invalid',now()),
    (multi_branch_staff_id,'branch-role-multi@example.invalid',now());

  INSERT INTO public.businesses(name,created_by)
  VALUES ('Branch Manager delegation test',owner_id)
  RETURNING id INTO v_business;

  INSERT INTO public.branches(business_id,code,name)
  VALUES (v_business,'A','Manager branch') RETURNING id INTO branch_a;
  INSERT INTO public.branches(business_id,code,name)
  VALUES (v_business,'B','Other branch') RETURNING id INTO branch_b;

  INSERT INTO public.business_memberships(business_id,user_id,role_code,job_title)
  VALUES
    (v_business,owner_id,'owner',NULL),
    (v_business,branch_manager_id,'branch_manager','branch_manager'),
    (v_business,cashier_id,'staff','sales_person'),
    (v_business,department_manager_id,'staff','entry_person'),
    (v_business,multi_branch_staff_id,'staff','entry_person');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM public.set_branch_access(v_business,branch_a,branch_manager_id,true);
  PERFORM public.set_branch_access(v_business,branch_a,cashier_id,true);
  PERFORM public.set_branch_access(v_business,branch_a,department_manager_id,true);
  PERFORM public.set_branch_access(v_business,branch_a,multi_branch_staff_id,true);
  PERFORM public.set_branch_access(v_business,branch_b,multi_branch_staff_id,true);
  RESET ROLE;

  SELECT id INTO department_manager_role
  FROM public.business_access_roles
  WHERE business_id=v_business AND code='position_department_manager' AND is_active;
  SELECT id INTO branch_manager_role
  FROM public.business_access_roles
  WHERE business_id=v_business AND code='position_branch_manager' AND is_active;
  ASSERT department_manager_role IS NOT NULL,'Department Manager role is seeded for every business';
  ASSERT branch_manager_role IS NOT NULL,'Branch Manager role remains available';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',branch_manager_id,'role','authenticated')::text,true);
  roles := public.get_business_access_roles(v_business);
  ASSERT roles @> jsonb_build_array(jsonb_build_object('id',department_manager_role)),
    'Branch Manager can see the Department Manager role for their branch';
  ASSERT NOT roles @> jsonb_build_array(jsonb_build_object('id',branch_manager_role)),
    'Branch Manager cannot delegate Branch Manager authority';

  PERFORM public.set_member_job_title(v_business,department_manager_id,'department_manager');
  PERFORM public.assign_business_access_role(v_business,department_manager_id,department_manager_role);
  assignments := public.get_business_member_access_roles(v_business);
  ASSERT assignments @> jsonb_build_array(jsonb_build_object('userId',department_manager_id,'roleId',department_manager_role)),
    'Branch Manager can assign Department Manager to a sole-branch employee';

  BEGIN
    PERFORM public.assign_business_access_role(v_business,multi_branch_staff_id,department_manager_role);
    RAISE EXCEPTION 'Expected cross-branch assignment to be rejected';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.assign_business_access_role(v_business,department_manager_id,branch_manager_role);
    RAISE EXCEPTION 'Expected Branch Manager role escalation to be rejected';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  team := public.get_branch_manager_team_access(v_business);
  ASSERT jsonb_array_length(team->'branches')=1,'Branch Manager sees only assigned branches';
  ASSERT NOT (team->'members' @> jsonb_build_array(jsonb_build_object('user_id',multi_branch_staff_id))),
    'Employees assigned to multiple branches are excluded from Branch Manager management';
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',department_manager_id,'role','authenticated')::text,true);
  ASSERT public.business_role_rank(v_business,department_manager_id)=40,
    'Department Manager remains below Branch Manager authority';
  ASSERT public.has_business_access_role(v_business,'position_department_manager'),
    'Department Manager position is represented by its own access role';
  ASSERT NOT public.has_business_access_role(v_business,'position_branch_manager'),
    'Department Manager is not a Branch Manager';
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',cashier_id,'role','authenticated')::text,true);
  ASSERT public.business_role_rank(v_business,cashier_id)=40,
    'Cashier remains a Staff-level role and cannot become a Branch Manager by title';
  ASSERT public.has_business_access_role(v_business,'position_sales_person'),
    'Cashier retains the separate Sales Person position role';
  ASSERT NOT public.has_business_access_role(v_business,'position_branch_manager'),
    'Cashier is not a Branch Manager';
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',multi_branch_staff_id,'role','authenticated')::text,true);
  ASSERT public.business_role_rank(v_business,multi_branch_staff_id)=40,
    'Staff remains below Branch Manager authority';
  ASSERT NOT public.has_business_access_role(v_business,'position_branch_manager'),
    'Staff is not a Branch Manager';
  RESET ROLE;

  RAISE NOTICE 'BRANCH_MANAGER_ROLE_DELEGATION_TESTS_PASSED';
END
$tests$;
ROLLBACK;
