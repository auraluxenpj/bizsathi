-- 0061: BizSathi HRM foundation (employees, attendance, leave, shifts and payroll).
-- Additive only. Reuses existing business_memberships, profiles and branches.
-- No production data is changed by committing this file; apply only after isolated review.

CREATE OR REPLACE FUNCTION public.hr_is_manager(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.business_role_rank(_business_id, auth.uid()) >= 80, false)
$$;
REVOKE ALL ON FUNCTION public.hr_is_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_is_manager(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_can_manage_payroll(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.business_role_rank(_business_id, auth.uid()) >= 60, false)
$$;
REVOKE ALL ON FUNCTION public.hr_can_manage_payroll(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_can_manage_payroll(uuid) TO authenticated;

-- Keep the existing job-title permission templates aligned with the new HR screens.
INSERT INTO public.job_title_denials(job_title, permission)
SELECT jt.job_title, p.permission
FROM (VALUES ('manager'),('accountant'),('branch_manager'),('sales_person'),('stock_manager'),('entry_person')) AS jt(job_title)
CROSS JOIN (VALUES
  ('hr.employees.create'),('hr.employees.edit'),('hr.attendance.create'),('hr.attendance.edit'),
  ('hr.leave.approve'),('hr.shifts.manage')
) AS p(permission)
ON CONFLICT DO NOTHING;

INSERT INTO public.job_title_denials(job_title, permission)
SELECT jt.job_title, p.permission
FROM (VALUES ('branch_manager'),('sales_person'),('stock_manager'),('entry_person')) AS jt(job_title)
CROSS JOIN (VALUES ('hr.employees.view'),('hr.payroll.view'),('hr.payroll.manage'),('hr.payroll.approve')) AS p(permission)
ON CONFLICT DO NOTHING;

CREATE TABLE public.hr_employee_records (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  branch_id uuid,
  employee_number text NOT NULL CHECK (employee_number ~ '^[A-Z0-9_-]{3,24}$'),
  department text CHECK (department IS NULL OR char_length(department) <= 100),
  designation text CHECK (designation IS NULL OR char_length(designation) <= 100),
  employment_type text NOT NULL DEFAULT 'full_time' CHECK (employment_type IN ('full_time','part_time','contract','temporary','intern')),
  joining_date date NOT NULL,
  confirmation_date date,
  employment_status text NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active','on_leave','suspended','terminated')),
  emergency_contact_name text CHECK (emergency_contact_name IS NULL OR char_length(emergency_contact_name) <= 120),
  emergency_contact_phone text CHECK (emergency_contact_phone IS NULL OR char_length(emergency_contact_phone) <= 30),
  address text CHECK (address IS NULL OR char_length(address) <= 500),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id),
  UNIQUE (business_id, employee_number),
  FOREIGN KEY (business_id, user_id) REFERENCES public.business_memberships(business_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT,
  CHECK (confirmation_date IS NULL OR confirmation_date >= joining_date)
);
CREATE INDEX hr_employee_branch_status_idx ON public.hr_employee_records(business_id, branch_id, employment_status);
ALTER TABLE public.hr_employee_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_employee_records FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.hr_employee_records TO authenticated;
CREATE POLICY hr_employee_read ON public.hr_employee_records FOR SELECT TO authenticated
  USING (public.hr_is_manager(business_id) OR public.hr_can_manage_payroll(business_id) OR user_id = auth.uid());
CREATE POLICY hr_employee_insert ON public.hr_employee_records FOR INSERT TO authenticated
  WITH CHECK (public.hr_is_manager(business_id) AND created_by = auth.uid() AND public.is_business_member(business_id));
CREATE POLICY hr_employee_update ON public.hr_employee_records FOR UPDATE TO authenticated
  USING (public.hr_is_manager(business_id))
  WITH CHECK (public.hr_is_manager(business_id));

CREATE TABLE public.hr_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  branch_id uuid,
  attendance_date date NOT NULL,
  check_in timestamptz,
  check_out timestamptz,
  attendance_status text NOT NULL DEFAULT 'present' CHECK (attendance_status IN ('present','late','half_day','absent','holiday','week_off')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, user_id) REFERENCES public.hr_employee_records(business_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT,
  UNIQUE (business_id, user_id, attendance_date),
  CHECK (check_out IS NULL OR check_in IS NOT NULL),
  CHECK (check_out IS NULL OR check_out >= check_in)
);
CREATE INDEX hr_attendance_business_date_idx ON public.hr_attendance(business_id, attendance_date DESC);
CREATE INDEX hr_attendance_employee_date_idx ON public.hr_attendance(business_id, user_id, attendance_date DESC);
ALTER TABLE public.hr_attendance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_attendance FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.hr_attendance TO authenticated;
CREATE POLICY hr_attendance_read ON public.hr_attendance FOR SELECT TO authenticated
  USING (public.hr_is_manager(business_id) OR user_id = auth.uid());
CREATE POLICY hr_attendance_insert ON public.hr_attendance FOR INSERT TO authenticated
  WITH CHECK (public.hr_is_manager(business_id) AND recorded_by = auth.uid());
CREATE POLICY hr_attendance_update ON public.hr_attendance FOR UPDATE TO authenticated
  USING (public.hr_is_manager(business_id))
  WITH CHECK (public.hr_is_manager(business_id));

CREATE OR REPLACE FUNCTION public.hr_clock_attendance(_business_id uuid, _attendance_date date, _direction text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $
DECLARE
  v_branch uuid;
  v_stamp timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_business_member(_business_id)
     OR _direction NOT IN ('check_in','check_out')
     OR _attendance_date IS NULL OR abs(_attendance_date-current_date) > 1 THEN
    RAISE EXCEPTION 'Attendance action is unavailable' USING ERRCODE='42501';
  END IF;
  SELECT branch_id INTO v_branch FROM public.hr_employee_records
  WHERE business_id=_business_id AND user_id=auth.uid() AND employment_status='active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active employee record is required before clocking attendance';
  END IF;

  IF _direction='check_in' THEN
    INSERT INTO public.hr_attendance(
      business_id,user_id,branch_id,attendance_date,check_in,attendance_status,recorded_by
    ) VALUES (
      _business_id,auth.uid(),v_branch,_attendance_date,now(),'present',auth.uid()
    )
    ON CONFLICT (business_id,user_id,attendance_date) DO UPDATE
      SET check_in=COALESCE(hr_attendance.check_in,EXCLUDED.check_in),
          attendance_status=CASE WHEN hr_attendance.attendance_status='absent' THEN 'present' ELSE hr_attendance.attendance_status END,
          updated_at=now()
      WHERE hr_attendance.check_in IS NULL
    RETURNING check_in INTO v_stamp;
  ELSE
    UPDATE public.hr_attendance SET check_out=now(),updated_at=now()
    WHERE business_id=_business_id AND user_id=auth.uid() AND attendance_date=_attendance_date
      AND check_in IS NOT NULL AND check_out IS NULL
    RETURNING check_out INTO v_stamp;
  END IF;

  IF v_stamp IS NULL THEN
    RAISE EXCEPTION 'Already checked in or out, or a check-in is required first';
  END IF;
  RETURN v_stamp;
END $;
REVOKE ALL ON FUNCTION public.hr_clock_attendance(uuid,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_clock_attendance(uuid,date,text) TO authenticated;

CREATE TABLE public.hr_leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  annual_quota numeric(6,2) NOT NULL DEFAULT 0 CHECK (annual_quota >= 0 AND annual_quota <= 366),
  is_paid boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name),
  UNIQUE (business_id, id)
);
ALTER TABLE public.hr_leave_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_leave_types FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.hr_leave_types TO authenticated;
CREATE POLICY hr_leave_types_read ON public.hr_leave_types FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
CREATE POLICY hr_leave_types_manage ON public.hr_leave_types FOR ALL TO authenticated
  USING (public.hr_is_manager(business_id))
  WITH CHECK (public.hr_is_manager(business_id));

CREATE TABLE public.hr_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  leave_type_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric(6,2) NOT NULL CHECK (days > 0 AND days <= 366),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 1000),
  request_status text NOT NULL DEFAULT 'pending' CHECK (request_status IN ('pending','approved','rejected','cancelled')),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, user_id) REFERENCES public.hr_employee_records(business_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, leave_type_id) REFERENCES public.hr_leave_types(business_id, id) ON DELETE RESTRICT,
  CHECK (end_date >= start_date),
  CHECK ((request_status IN ('pending','cancelled') AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (request_status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX hr_leave_requests_employee_idx ON public.hr_leave_requests(business_id, user_id, start_date DESC);
CREATE INDEX hr_leave_requests_status_idx ON public.hr_leave_requests(business_id, request_status, start_date);
ALTER TABLE public.hr_leave_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_leave_requests FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.hr_leave_requests TO authenticated;
CREATE POLICY hr_leave_read ON public.hr_leave_requests FOR SELECT TO authenticated
  USING (public.hr_is_manager(business_id) OR user_id = auth.uid());
CREATE POLICY hr_leave_insert ON public.hr_leave_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND request_status = 'pending' AND reviewed_by IS NULL AND public.is_business_member(business_id));
CREATE POLICY hr_leave_update_employee ON public.hr_leave_requests FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND request_status = 'pending')
  WITH CHECK (user_id = auth.uid() AND request_status IN ('pending','cancelled') AND reviewed_by IS NULL);
CREATE POLICY hr_leave_update_manager ON public.hr_leave_requests FOR UPDATE TO authenticated
  USING (public.hr_is_manager(business_id))
  WITH CHECK (public.hr_is_manager(business_id));

CREATE TABLE public.hr_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes smallint NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 480),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (business_id, name),
  CHECK (end_time <> start_time)
);
ALTER TABLE public.hr_shifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_shifts FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.hr_shifts TO authenticated;
CREATE POLICY hr_shifts_read ON public.hr_shifts FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
CREATE POLICY hr_shifts_manage ON public.hr_shifts FOR ALL TO authenticated
  USING (public.hr_is_manager(business_id))
  WITH CHECK (public.hr_is_manager(business_id));

CREATE TABLE public.hr_shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  shift_date date NOT NULL,
  branch_id uuid,
  assigned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, user_id) REFERENCES public.hr_employee_records(business_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, shift_id) REFERENCES public.hr_shifts(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT,
  UNIQUE (business_id, user_id, shift_date)
);
CREATE INDEX hr_shift_assignments_date_idx ON public.hr_shift_assignments(business_id, shift_date);
ALTER TABLE public.hr_shift_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_shift_assignments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_shift_assignments TO authenticated;
CREATE POLICY hr_shift_assignments_read ON public.hr_shift_assignments FOR SELECT TO authenticated
  USING (public.hr_is_manager(business_id) OR user_id = auth.uid());
CREATE POLICY hr_shift_assignments_insert ON public.hr_shift_assignments FOR INSERT TO authenticated
  WITH CHECK (public.hr_is_manager(business_id) AND assigned_by = auth.uid());
CREATE POLICY hr_shift_assignments_update ON public.hr_shift_assignments FOR UPDATE TO authenticated
  USING (public.hr_is_manager(business_id))
  WITH CHECK (public.hr_is_manager(business_id));
CREATE POLICY hr_shift_assignments_delete ON public.hr_shift_assignments FOR DELETE TO authenticated
  USING (public.hr_is_manager(business_id));

-- Compensation data is deliberately isolated from the general employee directory.
CREATE TABLE public.hr_salary_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  effective_from date NOT NULL,
  basic_salary numeric(14,2) NOT NULL CHECK (basic_salary >= 0),
  house_allowance numeric(14,2) NOT NULL DEFAULT 0 CHECK (house_allowance >= 0),
  transport_allowance numeric(14,2) NOT NULL DEFAULT 0 CHECK (transport_allowance >= 0),
  other_allowance numeric(14,2) NOT NULL DEFAULT 0 CHECK (other_allowance >= 0),
  tax_deduction numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_deduction >= 0),
  provident_fund numeric(14,2) NOT NULL DEFAULT 0 CHECK (provident_fund >= 0),
  insurance_deduction numeric(14,2) NOT NULL DEFAULT 0 CHECK (insurance_deduction >= 0),
  other_deduction numeric(14,2) NOT NULL DEFAULT 0 CHECK (other_deduction >= 0),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, user_id) REFERENCES public.hr_employee_records(business_id, user_id) ON DELETE RESTRICT,
  UNIQUE (business_id, user_id, effective_from)
);
CREATE INDEX hr_salary_effective_idx ON public.hr_salary_structures(business_id, user_id, effective_from DESC);
ALTER TABLE public.hr_salary_structures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_salary_structures FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.hr_salary_structures TO authenticated;
CREATE POLICY hr_salary_read ON public.hr_salary_structures FOR SELECT TO authenticated
  USING (public.hr_can_manage_payroll(business_id));
CREATE POLICY hr_salary_insert ON public.hr_salary_structures FOR INSERT TO authenticated
  WITH CHECK (public.hr_can_manage_payroll(business_id) AND created_by = auth.uid());
CREATE POLICY hr_salary_update ON public.hr_salary_structures FOR UPDATE TO authenticated
  USING (public.hr_can_manage_payroll(business_id))
  WITH CHECK (public.hr_can_manage_payroll(business_id));

CREATE TABLE public.hr_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_label text NOT NULL CHECK (char_length(period_label) BETWEEN 3 AND 40),
  run_status text NOT NULL DEFAULT 'draft' CHECK (run_status IN ('draft','approved','paid','void')),
  employee_count integer NOT NULL DEFAULT 0 CHECK (employee_count >= 0),
  gross_total numeric(16,2) NOT NULL DEFAULT 0 CHECK (gross_total >= 0),
  deduction_total numeric(16,2) NOT NULL DEFAULT 0 CHECK (deduction_total >= 0),
  net_total numeric(16,2) NOT NULL DEFAULT 0 CHECK (net_total >= 0),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  paid_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (business_id, period_start, period_end),
  CHECK (period_end >= period_start),
  CHECK ((run_status IN ('draft','void') AND approved_by IS NULL AND approved_at IS NULL AND paid_by IS NULL AND paid_at IS NULL)
      OR (run_status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND paid_by IS NULL AND paid_at IS NULL)
      OR (run_status = 'paid' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND paid_by IS NOT NULL AND paid_at IS NOT NULL))
);
ALTER TABLE public.hr_payroll_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_payroll_runs FROM anon;
GRANT SELECT ON public.hr_payroll_runs TO authenticated;
CREATE POLICY hr_payroll_runs_read ON public.hr_payroll_runs FOR SELECT TO authenticated
  USING (public.hr_can_manage_payroll(business_id));

CREATE TABLE public.hr_payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  payroll_run_id uuid NOT NULL,
  user_id uuid NOT NULL,
  employee_number text NOT NULL,
  employee_name text NOT NULL,
  basic_salary numeric(14,2) NOT NULL,
  allowances numeric(14,2) NOT NULL,
  gross_pay numeric(14,2) NOT NULL,
  period_label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  tax_deduction numeric(14,2) NOT NULL,
  provident_fund numeric(14,2) NOT NULL,
  insurance_deduction numeric(14,2) NOT NULL,
  other_deduction numeric(14,2) NOT NULL,
  unpaid_leave_days numeric(6,2) NOT NULL DEFAULT 0,
  unpaid_leave_deduction numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions numeric(14,2) NOT NULL,
  net_pay numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, payroll_run_id) REFERENCES public.hr_payroll_runs(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, user_id) REFERENCES public.hr_employee_records(business_id, user_id) ON DELETE RESTRICT,
  UNIQUE (payroll_run_id, user_id),
  CHECK (net_pay = gross_pay - total_deductions)
);
CREATE INDEX hr_payroll_items_employee_idx ON public.hr_payroll_items(business_id, user_id, created_at DESC);
ALTER TABLE public.hr_payroll_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_payroll_items FROM anon;
GRANT SELECT ON public.hr_payroll_items TO authenticated;
CREATE OR REPLACE FUNCTION public.hr_can_read_own_payslip(_business_id uuid, _run_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $
  SELECT EXISTS (SELECT 1 FROM public.hr_payroll_runs r
    JOIN public.hr_payroll_items i ON i.business_id=r.business_id AND i.payroll_run_id=r.id
    WHERE r.business_id=_business_id AND r.id=_run_id AND i.user_id=auth.uid()
      AND r.run_status IN ('approved','paid'))
$;
REVOKE ALL ON FUNCTION public.hr_can_read_own_payslip(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_can_read_own_payslip(uuid,uuid) TO authenticated;
CREATE POLICY hr_payroll_items_read ON public.hr_payroll_items FOR SELECT TO authenticated
  USING (public.hr_can_manage_payroll(business_id) OR public.hr_can_read_own_payslip(business_id,payroll_run_id));

CREATE OR REPLACE FUNCTION public.hr_generate_payroll(_business_id uuid, _period_start date, _period_end date, _period_label text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run uuid;
  v_days integer;
  v_expected integer;
  v_generated integer;
BEGIN
  IF NOT public.hr_can_manage_payroll(_business_id) OR _period_start IS NULL OR _period_end < _period_start
     OR char_length(btrim(_period_label)) NOT BETWEEN 3 AND 40 THEN
    RAISE EXCEPTION 'Not authorized or invalid payroll period' USING ERRCODE = '42501';
  END IF;
  v_days := (_period_end - _period_start) + 1;
  SELECT count(*) INTO v_expected FROM public.hr_employee_records
    WHERE business_id=_business_id AND employment_status IN ('active','on_leave') AND joining_date <= _period_end;
  INSERT INTO public.hr_payroll_runs(business_id,period_start,period_end,period_label,created_by)
  VALUES (_business_id,_period_start,_period_end,btrim(_period_label),auth.uid())
  RETURNING id INTO v_run;

  INSERT INTO public.hr_payroll_items(
    business_id,payroll_run_id,user_id,employee_number,employee_name,basic_salary,allowances,gross_pay,period_label,period_start,period_end,
    tax_deduction,provident_fund,insurance_deduction,other_deduction,unpaid_leave_days,
    unpaid_leave_deduction,total_deductions,net_pay
  )
  SELECT
    e.business_id,v_run,e.user_id,e.employee_number,COALESCE(NULLIF(p.full_name,''),'Employee'),
    round(s.basic_salary * calc.eligible_days / v_days,2),
    round((s.house_allowance+s.transport_allowance+s.other_allowance) * calc.eligible_days / v_days,2),
    round((s.basic_salary+s.house_allowance+s.transport_allowance+s.other_allowance) * calc.eligible_days / v_days,2),
    _period_label,_period_start,_period_end,
    round(s.tax_deduction * calc.eligible_days / v_days,2),
    round(s.provident_fund * calc.eligible_days / v_days,2),
    round(s.insurance_deduction * calc.eligible_days / v_days,2),
    round(s.other_deduction * calc.eligible_days / v_days,2),
    calc.unpaid_days,
    round((s.basic_salary+s.house_allowance+s.transport_allowance+s.other_allowance) * calc.unpaid_days / v_days,2),
    LEAST(
      round((s.basic_salary+s.house_allowance+s.transport_allowance+s.other_allowance) * calc.eligible_days / v_days,2),
      round((s.tax_deduction+s.provident_fund+s.insurance_deduction+s.other_deduction) * calc.eligible_days / v_days,2)
        + round((s.basic_salary+s.house_allowance+s.transport_allowance+s.other_allowance) * calc.unpaid_days / v_days,2)
    ),
    GREATEST(
      round((s.basic_salary+s.house_allowance+s.transport_allowance+s.other_allowance) * calc.eligible_days / v_days,2)
      - LEAST(
        round((s.basic_salary+s.house_allowance+s.transport_allowance+s.other_allowance) * calc.eligible_days / v_days,2),
        round((s.tax_deduction+s.provident_fund+s.insurance_deduction+s.other_deduction) * calc.eligible_days / v_days,2)
          + round((s.basic_salary+s.house_allowance+s.transport_allowance+s.other_allowance) * calc.unpaid_days / v_days,2)
      ),0
    )
  FROM public.hr_employee_records e
  JOIN public.profiles p ON p.id=e.user_id
  JOIN LATERAL (
    SELECT ss.* FROM public.hr_salary_structures ss
    WHERE ss.business_id=e.business_id AND ss.user_id=e.user_id AND ss.effective_from <= _period_end
    ORDER BY ss.effective_from DESC LIMIT 1
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(
      (LEAST(lr.end_date,_period_end)-GREATEST(lr.start_date,_period_start)+1)::numeric
      * lr.days / NULLIF((lr.end_date-lr.start_date+1),0)
    ),0) AS unpaid_days
    FROM public.hr_leave_requests lr
    JOIN public.hr_leave_types lt ON lt.business_id=lr.business_id AND lt.id=lr.leave_type_id
    WHERE lr.business_id=e.business_id AND lr.user_id=e.user_id AND lr.request_status='approved'
      AND lt.is_paid=false AND lr.start_date <= _period_end AND lr.end_date >= _period_start
  ) l ON true
  CROSS JOIN LATERAL (
    SELECT GREATEST(0, (_period_end - GREATEST(e.joining_date,_period_start) + 1))::numeric AS eligible_days,
      LEAST(GREATEST(0, (_period_end - GREATEST(e.joining_date,_period_start) + 1))::numeric, COALESCE(l.unpaid_days,0)) AS unpaid_days
  ) calc
  WHERE e.business_id=_business_id AND e.employment_status IN ('active','on_leave')
    AND e.joining_date <= _period_end;

  SELECT count(*) INTO v_generated FROM public.hr_payroll_items WHERE payroll_run_id=v_run;
  IF v_generated <> v_expected THEN
    RAISE EXCEPTION 'Every active employee needs an effective salary structure before payroll can be generated';
  END IF;

  UPDATE public.hr_payroll_runs r SET
    employee_count=(SELECT count(*) FROM public.hr_payroll_items i WHERE i.payroll_run_id=v_run),
    gross_total=COALESCE((SELECT sum(i.gross_pay) FROM public.hr_payroll_items i WHERE i.payroll_run_id=v_run),0),
    deduction_total=COALESCE((SELECT sum(i.total_deductions) FROM public.hr_payroll_items i WHERE i.payroll_run_id=v_run),0),
    net_total=COALESCE((SELECT sum(i.net_pay) FROM public.hr_payroll_items i WHERE i.payroll_run_id=v_run),0)
  WHERE r.id=v_run;
  RETURN v_run;
END $$;
REVOKE ALL ON FUNCTION public.hr_generate_payroll(uuid,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_generate_payroll(uuid,date,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_approve_payroll(_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business uuid;
BEGIN
  SELECT business_id INTO v_business FROM public.hr_payroll_runs WHERE id=_run_id FOR UPDATE;
  IF v_business IS NULL OR NOT public.hr_can_manage_payroll(v_business) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  UPDATE public.hr_payroll_runs SET run_status='approved',approved_by=auth.uid(),approved_at=now()
  WHERE id=_run_id AND run_status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only draft payroll can be approved'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.hr_approve_payroll(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_approve_payroll(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_mark_payroll_paid(_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business uuid;
BEGIN
  SELECT business_id INTO v_business FROM public.hr_payroll_runs WHERE id=_run_id FOR UPDATE;
  IF v_business IS NULL OR NOT public.hr_is_manager(v_business) THEN
    RAISE EXCEPTION 'Only a business administrator may mark payroll paid' USING ERRCODE='42501';
  END IF;
  UPDATE public.hr_payroll_runs SET run_status='paid',paid_by=auth.uid(),paid_at=now()
  WHERE id=_run_id AND run_status='approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only approved payroll can be marked paid'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.hr_mark_payroll_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_mark_payroll_paid(uuid) TO authenticated;

-- Keep compensation and payroll snapshots immutable once a run is approved.
CREATE OR REPLACE FUNCTION public.hr_guard_payroll_item_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT run_status INTO v_status FROM public.hr_payroll_runs
  WHERE id=COALESCE(OLD.payroll_run_id,NEW.payroll_run_id) FOR UPDATE;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Approved payroll snapshots are immutable' USING ERRCODE='42501';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public.hr_guard_payroll_item_mutation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hr_guard_payroll_item_mutation ON public.hr_payroll_items;
CREATE TRIGGER hr_guard_payroll_item_mutation BEFORE UPDATE OR DELETE ON public.hr_payroll_items
FOR EACH ROW EXECUTE FUNCTION public.hr_guard_payroll_item_mutation();

CREATE OR REPLACE FUNCTION public.hr_guard_payroll_run_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.run_status = 'draft' THEN
    IF NEW.business_id IS DISTINCT FROM OLD.business_id OR NEW.period_start IS DISTINCT FROM OLD.period_start
       OR NEW.period_end IS DISTINCT FROM OLD.period_end OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Payroll run identity cannot be changed' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.run_status = 'approved' AND NEW.run_status = 'paid'
     AND NEW.business_id IS NOT DISTINCT FROM OLD.business_id
     AND NEW.period_start IS NOT DISTINCT FROM OLD.period_start
     AND NEW.period_end IS NOT DISTINCT FROM OLD.period_end
     AND NEW.employee_count IS NOT DISTINCT FROM OLD.employee_count
     AND NEW.gross_total IS NOT DISTINCT FROM OLD.gross_total
     AND NEW.deduction_total IS NOT DISTINCT FROM OLD.deduction_total
     AND NEW.net_total IS NOT DISTINCT FROM OLD.net_total
     AND NEW.approved_by IS NOT DISTINCT FROM OLD.approved_by
     AND NEW.approved_at IS NOT DISTINCT FROM OLD.approved_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Approved payroll runs are immutable' USING ERRCODE='42501';
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_guard_payroll_run_mutation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hr_guard_payroll_run_mutation ON public.hr_payroll_runs;
CREATE TRIGGER hr_guard_payroll_run_mutation BEFORE UPDATE ON public.hr_payroll_runs
FOR EACH ROW EXECUTE FUNCTION public.hr_guard_payroll_run_mutation();
