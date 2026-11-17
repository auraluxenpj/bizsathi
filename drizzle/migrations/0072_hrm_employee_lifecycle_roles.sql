-- 0072: employee lifecycle, exit records, and job responsibilities.
-- Additive only: preserve employee, attendance, salary and payroll history.
ALTER TABLE public.hr_employee_records
  ADD COLUMN IF NOT EXISTS responsibilities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exit_date date,
  ADD COLUMN IF NOT EXISTS last_working_date date,
  ADD COLUMN IF NOT EXISTS exit_type text,
  ADD COLUMN IF NOT EXISTS exit_reason text,
  ADD COLUMN IF NOT EXISTS rehire_eligible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS final_settlement_date date;

ALTER TABLE public.hr_employee_drafts
  ADD COLUMN IF NOT EXISTS responsibilities text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.hr_employee_records
  DROP CONSTRAINT IF EXISTS hr_employee_records_exit_type_check,
  ADD CONSTRAINT hr_employee_records_exit_type_check
    CHECK (exit_type IS NULL OR exit_type IN ('resignation','termination','contract_end','retirement','absconded','other')),
  DROP CONSTRAINT IF EXISTS hr_employee_records_exit_dates_check,
  ADD CONSTRAINT hr_employee_records_exit_dates_check
    CHECK (
      (exit_date IS NULL OR exit_date >= joining_date)
      AND (last_working_date IS NULL OR last_working_date >= joining_date)
      AND (exit_date IS NULL OR last_working_date IS NULL OR last_working_date <= exit_date)
      AND (employment_status <> 'terminated' OR (exit_date IS NOT NULL AND last_working_date IS NOT NULL))
    ),
  DROP CONSTRAINT IF EXISTS hr_employee_records_responsibilities_check,
  ADD CONSTRAINT hr_employee_records_responsibilities_check
    CHECK (cardinality(responsibilities) <= 40);

ALTER TABLE public.hr_employee_drafts
  DROP CONSTRAINT IF EXISTS hr_employee_drafts_responsibilities_check,
  ADD CONSTRAINT hr_employee_drafts_responsibilities_check
    CHECK (cardinality(responsibilities) <= 40);

COMMENT ON COLUMN public.hr_employee_records.exit_date IS 'Effective employment exit date; employee row and history are retained.';
COMMENT ON COLUMN public.hr_employee_records.last_working_date IS 'Last date the employee physically worked.';
COMMENT ON COLUMN public.hr_employee_records.final_settlement_date IS 'Date final settlement was completed; not an automated bank payment.';
COMMENT ON COLUMN public.hr_employee_records.responsibilities IS 'HR job responsibilities only; does not grant application permissions.';
COMMENT ON COLUMN public.hr_employee_drafts.responsibilities IS 'Pre-onboarding responsibilities; does not grant application permissions.';

CREATE OR REPLACE FUNCTION public.hr_generate_payroll(_business_id uuid, _period_start date, _period_end date, _period_label text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    WHERE business_id=_business_id AND employment_status IN ('active','on_leave','terminated') AND joining_date <= _period_end AND (exit_date IS NULL OR exit_date >= _period_start);
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
    SELECT GREATEST(0, (LEAST(_period_end, COALESCE(e.last_working_date, e.exit_date, _period_end)) - GREATEST(e.joining_date,_period_start) + 1))::numeric AS eligible_days,
      LEAST(GREATEST(0, (LEAST(_period_end, COALESCE(e.last_working_date, e.exit_date, _period_end)) - GREATEST(e.joining_date,_period_start) + 1))::numeric, COALESCE(l.unpaid_days,0)) AS unpaid_days
  ) calc
  WHERE e.business_id=_business_id AND e.employment_status IN ('active','on_leave','terminated')
    AND e.joining_date <= _period_end AND (e.exit_date IS NULL OR e.exit_date >= _period_start);

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
END; $function$



-- Record the actual payroll payment date (Nepal local time) instead of silently using today's date.
DROP FUNCTION IF EXISTS public.hr_mark_payroll_paid(uuid);
CREATE OR REPLACE FUNCTION public.hr_mark_payroll_paid(_run_id uuid, _paid_date date DEFAULT current_date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_business uuid;
BEGIN
  SELECT business_id INTO v_business
  FROM public.hr_payroll_runs
  WHERE id = _run_id
  FOR UPDATE;

  IF v_business IS NULL OR NOT public.hr_is_manager(v_business) THEN
    RAISE EXCEPTION 'Only a business administrator may mark payroll paid' USING ERRCODE = '42501';
  END IF;
  IF _paid_date IS NULL OR _paid_date > current_date THEN
    RAISE EXCEPTION 'Payment date must be today or earlier';
  END IF;

  UPDATE public.hr_payroll_runs
  SET run_status = 'paid',
      paid_by = auth.uid(),
      paid_at = ((_paid_date::timestamp + time '12:00:00') AT TIME ZONE 'Asia/Kathmandu')
  WHERE id = _run_id AND run_status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only approved payroll can be marked paid';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.hr_mark_payroll_paid(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_mark_payroll_paid(uuid, date) TO authenticated;
