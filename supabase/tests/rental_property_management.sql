-- Rental Property Management security regression tests.
-- Run in the isolated SQL-security database. All synthetic records are rolled back.
BEGIN;

DO $seed$
DECLARE
  owner_id uuid := '10000000-0000-4000-8000-000000000001';
  accountant_id uuid := '10000000-0000-4000-8000-000000000002';
  outsider_id uuid := '10000000-0000-4000-8000-000000000003';
  business_id uuid := '10000000-0000-4000-8000-000000000004';
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  SELECT u,'rental-security+'||u||'@example.invalid',now(),'{}'::jsonb,now(),now()
  FROM unnest(ARRAY[owner_id,accountant_id,outsider_id]) u;

  INSERT INTO public.businesses(id,name,created_by)
  VALUES (business_id,'Rental security test business',owner_id);
  INSERT INTO public.business_memberships(business_id,user_id,role_code,status)
  VALUES (business_id,owner_id,'owner','active');
END;
$seed$;

SET LOCAL ROLE authenticated;

DO $tests$
DECLARE
  owner_id uuid;
  accountant_id uuid;
  outsider_id uuid;
  v_workspace_id uuid;
  property_id uuid;
  unit_id uuid;
  tenant_id uuid;
  agreement_id uuid;
  invoice_id uuid;
  rejected boolean;
  visible_count integer;
BEGIN
  owner_id := '10000000-0000-4000-8000-000000000001';
  accountant_id := '10000000-0000-4000-8000-000000000002';
  outsider_id := '10000000-0000-4000-8000-000000000003';

  -- A normal business owner can create one separate rental workspace.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  SELECT public.create_rental_workspace('Rental Security Test') INTO v_workspace_id;
  ASSERT v_workspace_id IS NOT NULL,'Business owner can create a rental workspace';
  ASSERT (SELECT count(*) FROM public.rental_workspaces WHERE id=v_workspace_id)=1,
    'Workspace is visible to its owner';

  -- Create the minimum rental records and one pending invoice as the owner.
  INSERT INTO public.rental_properties(workspace_id,name,created_by)
  VALUES (v_workspace_id,'Test property',owner_id) RETURNING id INTO property_id;
  INSERT INTO public.rental_units(workspace_id,property_id,unit_code,monthly_rent,created_by)
  VALUES (v_workspace_id,property_id,'Unit 1',10000,owner_id) RETURNING id INTO unit_id;
  INSERT INTO public.rental_tenants(workspace_id,full_name,created_by)
  VALUES (v_workspace_id,'Test tenant',owner_id) RETURNING id INTO tenant_id;
  INSERT INTO public.rental_agreements(workspace_id,unit_id,tenant_id,start_date,monthly_rent,due_day,created_by)
  VALUES (v_workspace_id,unit_id,tenant_id,'2026-11-01',10000,15,owner_id) RETURNING id INTO agreement_id;
  SELECT public.create_rental_invoice(
    v_workspace_id,tenant_id,unit_id,agreement_id,'2026-11-01','2026-11-30',
    '2026-11-27','2026-11-15','security test',
    '[{"description":"Monthly rent","category":"rent","quantity":1,"unit_rate":10000}]'::jsonb
  ) INTO invoice_id;
  ASSERT invoice_id IS NOT NULL,'Owner can generate a pending rental invoice';
  ASSERT (SELECT total FROM public.rental_invoices WHERE id=invoice_id)=10000,
    'Invoice total is calculated from invoice lines';

  -- Owner assigns an existing BizSathi profile as accountant.
  SELECT public.assign_rental_member(v_workspace_id,accountant_id,'accountant') IS NOT NULL INTO rejected;
  ASSERT rejected,'Owner can assign an existing profile as accountant';

  -- Accountant can view the workspace and records, but cannot approve or dispatch.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',accountant_id,'role','authenticated')::text,true);
  SELECT count(*) INTO visible_count FROM public.rental_workspaces WHERE id=v_workspace_id;
  ASSERT visible_count=1,'Active accountant can view the rental workspace';

  rejected := false;
  BEGIN
    PERFORM public.approve_rental_invoice(v_workspace_id,invoice_id);
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  ASSERT rejected,'Accountant cannot approve rental invoices';

  rejected := false;
  BEGIN
    PERFORM public.mark_rental_invoice_sent(v_workspace_id,invoice_id);
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  ASSERT rejected,'Accountant cannot dispatch rental invoices';

  rejected := false;
  BEGIN
    UPDATE public.rental_invoices SET status='approved' WHERE id=invoice_id;
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  ASSERT rejected,'Accountant cannot directly update protected invoice status columns';

  SELECT count(*) INTO visible_count FROM public.rental_audit_events WHERE rental_audit_events.workspace_id=v_workspace_id;
  ASSERT visible_count=0,'Accountant cannot read owner-only audit history';

  -- Owner approves and sends; accountant may then record a partial payment.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM public.approve_rental_invoice(v_workspace_id,invoice_id);
  PERFORM public.mark_rental_invoice_sent(v_workspace_id,invoice_id);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',accountant_id,'role','authenticated')::text,true);
  PERFORM public.record_rental_payment(v_workspace_id,invoice_id,4000,'2026-11-27','upi',NULL,'partial payment');
  ASSERT (SELECT status FROM public.rental_invoices WHERE id=invoice_id)='partially_paid',
    'Accountant can record a partial payment after owner dispatch';

  -- Owner can revoke access; the old employee session immediately loses RLS visibility.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  PERFORM public.deactivate_rental_member(v_workspace_id,
    (SELECT id FROM public.rental_memberships WHERE rental_memberships.workspace_id=v_workspace_id AND user_id=accountant_id));
  PERFORM set_config('request.jwt.claims',json_build_object('sub',accountant_id,'role','authenticated')::text,true);
  SELECT count(*) INTO visible_count FROM public.rental_workspaces WHERE id=v_workspace_id;
  ASSERT visible_count=0,'Deactivated accountant loses rental workspace access';

  -- An unrelated BizSathi profile cannot view or create rental workspaces.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',outsider_id,'role','authenticated')::text,true);
  SELECT count(*) INTO visible_count FROM public.rental_workspaces WHERE id=v_workspace_id;
  ASSERT visible_count=0,'Non-member cannot view rental workspace';
  rejected := false;
  BEGIN
    PERFORM public.create_rental_workspace('Unauthorized rental workspace');
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  ASSERT rejected,'Non-member without an active business-owner membership cannot create rental workspace';

  RAISE NOTICE 'RENTAL_PROPERTY_MANAGEMENT_SECURITY_TESTS_PASSED';
END;
$tests$;

ROLLBACK;
