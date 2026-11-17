-- 0068: delegated branch managers may approve only genuine leave-balance overrides.
-- Prevents a delegate from using an override reason to approve an in-balance request.
-- This migration is additive and must be applied only through the normal reviewed migration process.

CREATE OR REPLACE FUNCTION public.hr_enforce_leave_balance_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_annual numeric(6,2);
  v_accrual text;
  v_year integer;
  v_last_year integer;
  v_total_days integer;
  v_overlap_days integer;
  v_allocated numeric(8,2) := 0;
  v_available numeric(8,2);
  v_delta numeric(8,2);
  v_reason text;
  v_override_available numeric(8,2);
  v_override_needed boolean := false;
  v_is_manager boolean;
  v_is_delegate boolean;
BEGIN
  IF NEW.request_status <> 'approved'
     OR (TG_OP = 'UPDATE' AND OLD.request_status = 'approved') THEN
    RETURN NEW;
  END IF;

  v_is_manager := public.hr_is_manager(NEW.business_id);
  v_is_delegate := public.hr_is_leave_delegate(NEW.business_id, NEW.user_id);
  IF auth.uid() IS NULL OR NOT (v_is_manager OR v_is_delegate) THEN
    RAISE EXCEPTION 'Only an HR administrator or the delegated branch manager may approve this leave request'
      USING ERRCODE='42501';
  END IF;

  PERFORM 1 FROM public.hr_employee_records
   WHERE business_id=NEW.business_id AND user_id=NEW.user_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee record not found'; END IF;

  SELECT annual_quota, accrual_method
    INTO v_annual, v_accrual
    FROM public.hr_leave_types
   WHERE business_id=NEW.business_id AND id=NEW.leave_type_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active leave type not found'; END IF;

  v_total_days := (NEW.end_date - NEW.start_date) + 1;
  v_year := extract(year FROM NEW.start_date)::integer;
  v_last_year := extract(year FROM NEW.end_date)::integer;

  WHILE v_year <= v_last_year LOOP
    IF v_year < extract(year FROM current_date)::integer THEN
      v_available := v_annual;
    ELSIF v_year > extract(year FROM current_date)::integer THEN
      v_available := CASE WHEN v_accrual='front_loaded' THEN v_annual ELSE 0 END;
    ELSE
      v_available := CASE
        WHEN v_accrual='monthly' THEN round(v_annual * extract(month FROM current_date)::numeric / 12, 2)
        ELSE v_annual
      END;
    END IF;

    SELECT v_available + COALESCE(sum(delta_days),0)
      INTO v_available
      FROM public.hr_leave_balance_entries
     WHERE business_id=NEW.business_id AND user_id=NEW.user_id
       AND leave_type_id=NEW.leave_type_id AND leave_year=v_year;

    v_overlap_days := (
      LEAST(NEW.end_date,make_date(v_year,12,31))
      - GREATEST(NEW.start_date,make_date(v_year,1,1))
    ) + 1;
    IF v_year=v_last_year THEN
      v_delta := round(NEW.days-v_allocated,2);
    ELSE
      v_delta := round(NEW.days * v_overlap_days / v_total_days,2);
      v_allocated := v_allocated + v_delta;
    END IF;

    IF v_available + 0.0001 < v_delta THEN
      v_reason := NULLIF(btrim(current_setting('app.hrm_leave_override_reason',true)),'');
      IF v_reason IS NULL OR char_length(v_reason)>500 THEN
        RAISE EXCEPTION 'Insufficient leave balance for %: requested % day(s), available % day(s). A delegated administrator override with a reason is required.',
          v_year, v_delta, round(v_available,2)
          USING ERRCODE='P0001';
      END IF;
      IF NOT v_is_delegate THEN
        RAISE EXCEPTION 'Only the delegated branch manager may approve a leave balance override'
          USING ERRCODE='42501';
      END IF;
      v_override_needed := true;
      v_override_available := LEAST(COALESCE(v_override_available,round(v_available,2)),round(v_available,2));
    END IF;
    v_year := v_year+1;
  END LOOP;

  -- A delegated branch manager has authority only for a real balance exception.
  -- A supplied reason alone must never broaden ordinary leave-approval authority.
  IF v_is_delegate AND NOT v_is_manager AND NOT v_override_needed THEN
    RAISE EXCEPTION 'Delegated approval is limited to requests that exceed the available leave balance'
      USING ERRCODE='42501';
  END IF;

  IF v_override_needed THEN
    INSERT INTO public.hr_leave_balance_overrides(
      business_id,request_id,user_id,leave_type_id,requested_days,available_days,reason,approved_by
    ) VALUES (
      NEW.business_id,NEW.id,NEW.user_id,NEW.leave_type_id,NEW.days,v_override_available,v_reason,auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_enforce_leave_balance_on_approval() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.hr_enforce_leave_balance_on_approval() IS
  'HR managers approve ordinary requests. Delegated branch managers may approve only a genuine over-balance request with a recorded reason.';
