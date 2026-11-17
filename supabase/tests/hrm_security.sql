-- Isolated disposable PostgreSQL only. All synthetic users and HR records roll back.
-- Verifies tenant-scoped employee data, payroll role boundaries and employee payslip release.
BEGIN;
DO $tests$
DECLARE
  owner_id uuid := gen_random_uuid();
  accountant_id uuid := gen_random_uuid();
  employee_id uuid := gen_random_uuid();
  v_business_id uuid;
  v_leave_type uuid;
  v_run uuid;
  v_count integer;
  v_net numeric(14,2);
  v_balance numeric(8,2);
  v_request_id uuid;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  SELECT u,'hrm-test+'||u||'@example.invalid',now(),'{}'::jsonb,now(),now()
  FROM unnest(ARRAY[owner_id,accountant_id,employee_id]) u;

  INSERT INTO public.businesses(name,created_by)
  VALUES ('Synthetic HRM security test',owner_id)
  RETURNING id INTO v_business_id;

  INSERT INTO public.business_memberships(business_id,user_id,role_code,status)
  VALUES
    (v_business_id,owner_id,'owner','active'),
    (v_business_id,accountant_id,'accountant','active'),
    (v_business_id,employee_id,'staff','active');

  INSERT INTO public.hr_employee_records(
    business_id,user_id,employee_number,designation,joining_date,employment_status,created_by
  ) VALUES (
    v_business_id,employee_id,'HRM-TEST-01','Sales Associate','2026-01-01','active',owner_id
  );

  INSERT INTO public.hr_leave_types(business_id,name,annual_quota,is_paid,accrual_method)
  VALUES (v_business_id,'Unpaid Leave',5,false,'monthly') RETURNING id INTO v_leave_type;

  INSERT INTO public.hr_attendance_policies(business_id,workday_minutes,unpaid_break_minutes,grace_minutes,overtime_after_minutes,overtime_multiplier,updated_by)
  VALUES (v_business_id,480,60,10,0,1.5,owner_id);

  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  INSERT INTO public.hr_leave_requests(
    business_id,user_id,leave_type_id,start_date,end_date,days,request_status,reviewed_by,reviewed_at
  ) VALUES (
    v_business_id,employee_id,v_leave_type,'2026-11-10','2026-11-11',2,'approved',owner_id,now()
  );

  INSERT INTO public.hr_salary_structures(
    business_id,user_id,effective_from,basic_salary,house_allowance,transport_allowance,other_allowance,
    tax_deduction,provident_fund,insurance_deduction,other_deduction,created_by
  ) VALUES (
    v_business_id,employee_id,'2026-01-01',50000,5000,3000,2000,1000,2000,0,0,owner_id
  );

  -- Employee sees their own HR record, but never the compensation structure or draft payslip.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',employee_id,'role','authenticated')::text,true);
  SELECT count(*) INTO v_count FROM public.hr_employee_records WHERE business_id=v_business_id;
  ASSERT v_count=1,'Employee can read their own HR profile';
  PERFORM public.hr_clock_attendance(v_business_id,current_date,'check_in');
  PERFORM public.hr_clock_attendance(v_business_id,current_date,'check_out');
  SELECT count(*) INTO v_count FROM public.hr_attendance
    WHERE business_id=v_business_id AND user_id=employee_id AND attendance_date=current_date
      AND check_in IS NOT NULL AND check_out IS NOT NULL;
  ASSERT v_count=1,'Employee can only clock their own attendance in and out';

  SELECT count(*) INTO v_count FROM public.hr_salary_structures WHERE business_id=v_business_id;
  ASSERT v_count=0,'Employee cannot read salary structures';
  SELECT count(*),sum(delta_days) INTO v_count,v_balance
  FROM public.hr_leave_balance_entries
  WHERE business_id=v_business_id AND user_id=employee_id AND leave_year=2026;
  ASSERT v_count=1 AND v_balance=-2,'Approved leave is automatically posted to the employee leave ledger';
  SELECT count(*) INTO v_count FROM public.hr_attendance_policies WHERE business_id=v_business_id;
  ASSERT v_count=1,'Employee can read attendance rules';
  UPDATE public.hr_attendance_policies SET grace_minutes=99 WHERE business_id=v_business_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count=0,'Employee cannot change attendance policy';
  RESET ROLE;

  -- Accountant can access the payroll workflow and generate the monthly snapshot.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',accountant_id,'role','authenticated')::text,true);
  SELECT count(*) INTO v_count FROM public.hr_employee_records WHERE business_id=v_business_id;
  ASSERT v_count=0,'Accountant cannot directly read private employee HR records';
  SELECT count(*) INTO v_count FROM public.hr_list_payroll_employees(v_business_id);
  ASSERT v_count=1,'Payroll-authorized accountant can resolve limited employee fields';
  SELECT count(*) INTO v_count FROM public.hr_leave_balance_entries WHERE business_id=v_business_id;
  ASSERT v_count=0,'Accountant cannot read private employee leave balances';
  BEGIN
    PERFORM public.hr_adjust_leave_balance(v_business_id,employee_id,v_leave_type,2026,'adjustment',1,'Unauthorized adjustment');
    RAISE EXCEPTION 'Accountant unexpectedly changed a leave balance';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  v_run := public.hr_generate_payroll(v_business_id,'2026-11-01','2026-11-30','November 2026');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',employee_id,'role','authenticated')::text,true);
  SELECT count(*) INTO v_count FROM public.hr_payroll_items WHERE business_id=v_business_id;
  ASSERT v_count=0,'Employee cannot read a draft payslip';
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',accountant_id,'role','authenticated')::text,true);
  PERFORM public.hr_approve_payroll(v_run);
  UPDATE public.hr_attendance_policies SET grace_minutes=12,updated_by=accountant_id WHERE business_id=v_business_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count=0,'Accountant cannot change attendance policy';
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  UPDATE public.hr_attendance_policies SET grace_minutes=12,updated_by=owner_id WHERE business_id=v_business_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count=1,'Business owner can update attendance policy';
  PERFORM public.hr_adjust_leave_balance(v_business_id,employee_id,v_leave_type,2026,'opening_balance',3,'Imported opening balance');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',employee_id,'role','authenticated')::text,true);
  SELECT count(*),max(net_pay) INTO v_count,v_net
  FROM public.hr_payroll_items WHERE business_id=v_business_id;
  ASSERT v_count=1,'Employee can read their own payslip after approval';
  ASSERT v_net=53000,'Payroll prorates two unpaid leave days and applies fixed deductions';
  SELECT sum(delta_days) INTO v_balance FROM public.hr_leave_balance_entries
    WHERE business_id=v_business_id AND user_id=employee_id AND leave_year=2026;
  ASSERT v_balance=1,'Employee sees opening balance plus approved leave consumption';
  RESET ROLE;

  -- A pending request that exceeds the available balance cannot be approved without an override.
  INSERT INTO public.hr_leave_requests(
    business_id,user_id,leave_type_id,start_date,end_date,days,request_status
  ) VALUES (
    v_business_id,employee_id,v_leave_type,current_date+1,current_date+7,7,'pending'
  ) RETURNING id INTO v_request_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.hr_review_leave_request(v_business_id,v_request_id,'approved',NULL,NULL);
    RAISE EXCEPTION 'Overdrawn leave approval unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT SQLERRM LIKE 'Insufficient leave balance%', 'Approval fails specifically because the balance is insufficient';
  END;

  PERFORM public.hr_review_leave_request(
    v_business_id,v_request_id,'approved',NULL,'Emergency exception approved by owner'
  );
  SELECT count(*) INTO v_count FROM public.hr_leave_balance_overrides
   WHERE business_id=v_business_id AND request_id=v_request_id
     AND approved_by=owner_id AND reason='Emergency exception approved by owner';
  ASSERT v_count=1,'Administrator override is recorded once with approver and reason';

  SELECT sum(delta_days) INTO v_balance FROM public.hr_leave_balance_entries
   WHERE business_id=v_business_id AND user_id=employee_id AND leave_year=extract(year FROM current_date)::integer;
  ASSERT v_balance=-6,'Overridden leave is still posted to the append-only balance ledger';
  RESET ROLE;

  RAISE NOTICE 'HRM_SECURITY_TESTS_PASSED';
END;
$tests$;
ROLLBACK;
