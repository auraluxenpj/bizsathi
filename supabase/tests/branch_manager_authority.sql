-- Run only in an isolated database with project migrations through 0059 applied.
-- Verifies the distinct Branch Manager rank, branch boundary, delegation ceiling and approval helper.
BEGIN;
DO $tests$
DECLARE
  owner_id uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  manager_id uuid := gen_random_uuid();
  accountant_id uuid := gen_random_uuid();
  business_id uuid;
  branch_a uuid;
  branch_b uuid;
  ok boolean;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at)
  VALUES
    (owner_id,'bm-owner@example.invalid',now()),
    (admin_id,'bm-admin@example.invalid',now()),
    (manager_id,'bm-manager@example.invalid',now()),
    (accountant_id,'bm-accountant@example.invalid',now());

  INSERT INTO public.businesses(name,created_by)
  VALUES ('Branch Manager test',owner_id)
  RETURNING id INTO business_id;

  INSERT INTO public.branches(business_id,code,name)
  VALUES (business_id,'A','Assigned branch')
  RETURNING id INTO branch_a;

  INSERT INTO public.branches(business_id,code,name)
  VALUES (business_id,'B','Unassigned branch')
  RETURNING id INTO branch_b;

  INSERT INTO public.business_memberships(business_id,user_id,role_code)
  VALUES
    (business_id,owner_id,'owner'),
    (business_id,admin_id,'admin'),
    (business_id,manager_id,'branch_manager'),
    (business_id,accountant_id,'accountant');

  UPDATE public.business_memberships
  SET job_title='branch_manager'
  WHERE business_id=business_id AND user_id=manager_id;

  UPDATE public.business_memberships
  SET job_title='accountant'
  WHERE business_id=business_id AND user_id=accountant_id;

  INSERT INTO public.branch_memberships(business_id,branch_id,user_id,granted_by)
  VALUES (business_id,branch_a,manager_id,admin_id);

  -- Admin assigns only the staff/viewer delegation to the one branch.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',admin_id,'role','authenticated')::text,true);
  PERFORM public.grant_branch_delegation(
    business_id,branch_a,manager_id,ARRAY['staff','viewer'],5,7
  );
  RESET ROLE;

  -- The new role is distinct from Accountant and remains below Admin.
  ASSERT (SELECT rank FROM public.roles WHERE code='branch_manager')=50,
    'Branch Manager has its own rank';
  ASSERT public.job_title_role('branch_manager')='branch_manager',
    'Branch Manager title maps to the distinct role';
  ASSERT public.job_title_role('manager')='accountant',
    'Legacy Manager title retains historical Accountant mapping';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',manager_id,'role','authenticated')::text,true);

  ASSERT public.business_role_rank(business_id,manager_id)=50,
    'Branch Manager membership uses rank 50';
  ASSERT NOT public.has_business_role(business_id,'accountant'),
    'Branch Manager does not inherit Accountant rank';
  ASSERT NOT public.has_business_role(business_id,'admin'),
    'Branch Manager does not inherit Admin rank';
  ASSERT public.can_access_branch(business_id,branch_a),
    'Assigned branch is accessible';
  ASSERT NOT public.can_access_branch(business_id,branch_b),
    'Unassigned branch is not accessible';
  ASSERT public.can_approve_inventory_count(business_id,branch_a),
    'Branch Manager may approve counts in the assigned branch';
  ASSERT NOT public.can_approve_inventory_count(business_id,branch_b),
    'Branch Manager cannot approve counts in an unassigned branch';
  ASSERT public.team_invite_authority(manager_id,business_id,branch_a,'staff'),
    'Delegated staff invitation is permitted in the assigned branch';
  ASSERT NOT public.team_invite_authority(manager_id,business_id,branch_b,'staff'),
    'Invitation is denied in an unassigned branch';
  ASSERT NOT public.team_invite_authority(manager_id,business_id,branch_a,'branch_manager'),
    'Branch Manager cannot appoint another Branch Manager';
  ASSERT EXISTS (
    SELECT 1 FROM public.job_title_denials
    WHERE job_title='branch_manager' AND permission='other.purchase_price'
  ), 'Branch Manager purchase price is denied by default';
  ASSERT EXISTS (
    SELECT 1 FROM public.job_title_denials
    WHERE job_title='branch_manager' AND permission='settings.edit'
  ), 'Branch Manager business settings are denied by default';

  ok := false;
  BEGIN
    PERFORM public.grant_branch_delegation(
      business_id,branch_a,accountant_id,ARRAY['staff'],5,7
    );
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'Branch Manager cannot appoint or delegate another manager';

  RESET ROLE;

  -- Accountant keeps financial rank but is not automatically a Branch Manager approver.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',accountant_id,'role','authenticated')::text,true);
  ASSERT NOT public.can_approve_inventory_count(business_id,branch_a),
    'Accountant cannot approve inventory counts by role alone';
  RESET ROLE;

  -- Admin remains able to approve across business branches.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',admin_id,'role','authenticated')::text,true);
  ASSERT public.can_approve_inventory_count(business_id,branch_a),
    'Admin retains approval authority in assigned branch';
  ASSERT public.can_approve_inventory_count(business_id,branch_b),
    'Admin retains business-wide branch approval authority';
  RESET ROLE;

  RAISE NOTICE 'BRANCH_MANAGER_AUTHORITY_TESTS_PASSED';
END
$tests$;
ROLLBACK;
