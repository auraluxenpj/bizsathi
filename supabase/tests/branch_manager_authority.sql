-- Run only in an isolated database with project migrations through 0059 applied.
-- Verifies the distinct Branch Manager rank, branch boundary, delegation ceiling and approval helper.
BEGIN;
DO $tests$
DECLARE
  owner_id uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  manager_id uuid := gen_random_uuid();
  accountant_id uuid := gen_random_uuid();
  v_business_id uuid;
  v_branch_a uuid;
  v_branch_b uuid;
  v_invitation_id uuid;
  ok boolean;
  invitation_error text;
  invitation_sqlstate text;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at)
  VALUES
    (owner_id,'bm-owner@example.invalid',now()),
    (admin_id,'bm-admin@example.invalid',now()),
    (manager_id,'bm-manager@example.invalid',now()),
    (accountant_id,'bm-accountant@example.invalid',now());

  INSERT INTO public.businesses(name,created_by)
  VALUES ('Branch Manager test',owner_id)
  RETURNING id INTO v_business_id;

  INSERT INTO public.branches(business_id,code,name)
  VALUES (v_business_id,'A','Assigned branch')
  RETURNING id INTO v_branch_a;

  INSERT INTO public.branches(business_id,code,name)
  VALUES (v_business_id,'B','Unassigned branch')
  RETURNING id INTO v_branch_b;

  INSERT INTO public.business_memberships(business_id,user_id,role_code)
  VALUES
    (v_business_id,owner_id,'owner'),
    (v_business_id,admin_id,'admin'),
    (v_business_id,manager_id,'branch_manager'),
    (v_business_id,accountant_id,'accountant');

  UPDATE public.business_memberships
  SET job_title='branch_manager'
  WHERE business_id=v_business_id AND user_id=manager_id;

  UPDATE public.business_memberships
  SET job_title='accountant'
  WHERE business_id=v_business_id AND user_id=accountant_id;

  INSERT INTO public.branch_memberships(business_id,branch_id,user_id,granted_by)
  VALUES (v_business_id,v_branch_a,manager_id,admin_id);
  INSERT INTO public.branch_memberships(business_id,branch_id,user_id,granted_by)
  VALUES (v_business_id,v_branch_a,accountant_id,admin_id);

  -- Admin assigns only the staff/viewer delegation to the one branch.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',admin_id,'role','authenticated')::text,true);
  PERFORM public.grant_branch_delegation(
    v_business_id,v_branch_a,manager_id,ARRAY['staff','viewer'],5,7
  );
  RESET ROLE;

  ASSERT (SELECT rank FROM public.roles WHERE code='branch_manager')=50,
    'Branch Manager has its own rank';
  ASSERT public.job_title_role('branch_manager')='branch_manager',
    'Branch Manager title maps to the distinct role';
  ASSERT public.job_title_role('manager')='accountant',
    'Legacy Manager title retains historical Accountant mapping';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',manager_id,'role','authenticated')::text,true);
  ASSERT NOT public.has_business_role(v_business_id,'accountant'),
    'Branch Manager does not inherit Accountant rank';
  ASSERT NOT public.has_business_role(v_business_id,'admin'),
    'Branch Manager does not inherit Admin rank';
  ASSERT public.has_permission(v_business_id,'stock.edit'),
    'Branch Manager may use permitted branch stock operations';
  ASSERT NOT public.has_permission(v_business_id,'purchases.view'),
    'Branch Manager cannot read purchase documents containing unit costs';
  ASSERT NOT public.has_permission(v_business_id,'settings.edit'),
    'Branch Manager cannot gain business settings by missing or customized denials';
  ASSERT public.can_access_branch(v_business_id,v_branch_a),
    'Assigned branch is accessible';
  ASSERT NOT public.can_access_branch(v_business_id,v_branch_b),
    'Unassigned branch is not accessible';
  ASSERT public.can_approve_inventory_count(v_business_id,v_branch_a),
    'Branch Manager may approve counts in the assigned branch';
  ASSERT NOT public.can_approve_inventory_count(v_business_id,v_branch_b),
    'Branch Manager cannot approve counts in an unassigned branch';

  ok := false;
  BEGIN
    v_invitation_id := public.create_team_invitation(
      v_business_id,v_branch_a,'staff','sales_person','{}',
      'invitee@example.invalid','9841000001',repeat('a',64),
      now()+interval '2 days',1,'Branch manager test'
    );
  EXCEPTION WHEN OTHERS THEN
    ok := true;
    GET STACKED DIAGNOSTICS invitation_error = MESSAGE_TEXT,
                            invitation_sqlstate = RETURNED_SQLSTATE;
    RAISE NOTICE 'Delegated staff invitation failed [SQLSTATE %]: %', invitation_sqlstate, invitation_error;
  END;
  ASSERT NOT ok, 'Delegated staff invitation is permitted in the assigned branch';
  ASSERT EXISTS (
    SELECT 1 FROM public.team_invitations
    WHERE id=v_invitation_id
      AND 'settings.edit'=ANY(denied_permissions)
      AND 'other.purchase_price'=ANY(denied_permissions)
      AND 'purchases.view'=ANY(denied_permissions)
  ), 'Delegated invitation automatically inherits the Branch Manager permission ceiling';

  ok := false;
  BEGIN
    PERFORM public.create_team_invitation(
      v_business_id,v_branch_b,'staff','sales_person','{}',
      'invitee2@example.invalid','9841000002',repeat('b',64),
      now()+interval '2 days',1,'Unassigned branch test'
    );
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  ASSERT ok, 'Invitation is denied in an unassigned branch';

  ok := false;
  BEGIN
    PERFORM public.create_team_invitation(
      v_business_id,v_branch_a,'branch_manager','branch_manager','{}',
      'invitee3@example.invalid','9841000003',repeat('c',64),
      now()+interval '2 days',1,'Peer manager test'
    );
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  ASSERT ok, 'Branch Manager cannot appoint another Branch Manager';

  -- Inspect the static role template as the database owner; this table is intentionally
  -- not directly readable by ordinary authenticated members.
  RESET ROLE;
  ASSERT EXISTS (
    SELECT 1 FROM public.job_title_denials
    WHERE job_title='branch_manager' AND permission='other.purchase_price'
  ), 'Branch Manager purchase price field is denied by default';
  ASSERT EXISTS (
    SELECT 1 FROM public.job_title_denials
    WHERE job_title='branch_manager' AND permission='purchases.view'
  ), 'Branch Manager purchase documents are denied because their lines contain unit costs';
  ASSERT EXISTS (
    SELECT 1 FROM public.job_title_denials
    WHERE job_title='branch_manager' AND permission='settings.edit'
  ), 'Branch Manager business settings are denied by default';

  -- Restore the Branch Manager actor before testing prohibited delegation changes.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',manager_id,'role','authenticated')::text,true);
  ok := false;
  BEGIN
    PERFORM public.grant_branch_delegation(
      v_business_id,v_branch_a,accountant_id,ARRAY['staff'],5,7
    );
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'Branch Manager cannot appoint or delegate another manager';

  RESET ROLE;

  -- Change the HR designation without changing assigned access roles.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM public.set_member_job_title(v_business_id,manager_id,'sales_person');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',manager_id,'role','authenticated')::text,true);
  ASSERT public.has_permission(v_business_id,'stock.edit'),
    'Changing the HR designation does not silently remove the Branch Manager access role';
  ASSERT public.can_approve_inventory_count(v_business_id,v_branch_a),
    'Branch Manager approval follows the assigned access role, not the HR title';
  RESET ROLE;

  -- Remove the Branch Manager authority role. The HR title alone must not restore it.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  UPDATE public.business_memberships
  SET role_code='staff'
  WHERE business_id=v_business_id AND user_id=manager_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',manager_id,'role','authenticated')::text,true);
  ASSERT NOT public.has_business_role(v_business_id,'branch_manager'),
    'Branch Manager authority is removed when the authority role is removed';
  ASSERT NOT public.can_approve_inventory_count(v_business_id,v_branch_a),
    'HR designation alone cannot approve inventory counts';
  ok := false;
  BEGIN
    PERFORM public.create_team_invitation(
      v_business_id,v_branch_a,'accountant','accountant','{}',
      'invitee4@example.invalid','9841000004',repeat('d',64),
      now()+interval '2 days',1,'Non-manager role delegation test'
    );
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  ASSERT ok, 'An employee without Branch Manager authority cannot invite outside delegated roles';
  RESET ROLE;

  -- Restore the authority role explicitly, without changing the HR designation.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  UPDATE public.business_memberships
  SET role_code='branch_manager'
  WHERE business_id=v_business_id AND user_id=manager_id;
  SELECT id INTO v_invitation_id FROM public.business_access_roles
  WHERE business_id=v_business_id AND code='legacy_branch_manager';
  PERFORM public.assign_business_access_role(v_business_id,manager_id,v_invitation_id);

  -- Accountant keeps financial rank but is not automatically a Branch Manager approver.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',accountant_id,'role','authenticated')::text,true);
  ASSERT NOT public.can_approve_inventory_count(v_business_id,v_branch_a),
    'Accountant cannot approve inventory counts by role alone';
  RESET ROLE;

  -- Admin retains business-wide approval authority.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',admin_id,'role','authenticated')::text,true);
  ASSERT public.can_approve_inventory_count(v_business_id,v_branch_a),
    'Admin retains approval authority in assigned branch';
  ASSERT public.can_approve_inventory_count(v_business_id,v_branch_b),
    'Admin retains business-wide branch approval authority';
  RESET ROLE;

  RAISE NOTICE 'BRANCH_MANAGER_AUTHORITY_TESTS_PASSED';
END
$tests$;
ROLLBACK;
