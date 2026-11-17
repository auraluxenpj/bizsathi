-- 0065: restrict leave balance details and overrides to the explicitly delegated branch manager.
-- Uses the existing delegation_grants + branch access model; no parallel HR role system.
-- Employees, ordinary managers, and business admins do not receive automatic ledger/audit visibility.

CREATE OR REPLACE FUNCTION public.hr_is_leave_delegate(_business_id uuid, _employee_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.hr_employee_records e
      JOIN public.delegation_grants g
        ON g.business_id = e.business_id
       AND g.branch_id = e.branch_id
       AND g.manager_user_id = auth.uid()
       AND g.revoked_at IS NULL
      WHERE e.business_id = _business_id
        AND e.user_id = _employee_user_id
        AND e.branch_id IS NOT NULL
        AND public.can_access_branch(e.business_id, e.branch_id)
    )
$$;
REVOKE ALL ON FUNCTION public.hr_is_leave_delegate(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_is_leave_delegate(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS hr_leave_balance_read ON public.hr_leave_balance_entries;
CREATE POLICY hr_leave_balance_read ON public.hr_leave_balance_entries
  FOR SELECT TO authenticated
  USING (public.hr_is_leave_delegate(business_id, user_id));

DROP POLICY IF EXISTS hr_leave_balance_override_read ON public.hr_leave_balance_overrides;
CREATE POLICY hr_leave_balance_override_read ON public.hr_leave_balance_overrides
  FOR SELECT TO authenticated
  USING (public.hr_is_leave_delegate(business_id, user_id));

CREATE OR REPLACE FUNCTION public.hr_adjust_leave_balance(
  _business_id uuid,
  _user_id uuid,
  _leave_type_id uuid,
  _leave_year integer,
  _entry_type text,
  _delta_days numeric,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.hr_is_leave_delegate(_business_id, _user_id) THEN
    RAISE EXCEPTION 'Only the delegated branch manager can adjust this employee leave balance'
      USING ERRCODE='42501';
  END IF;
  IF _entry_type NOT IN ('opening_balance','carry_forward','adjustment')
     OR _leave_year NOT BETWEEN 2000 AND 2200
     OR _delta_days IS NULL OR _delta_days=0 OR abs(_delta_days)>3660
     OR char_length(COALESCE(_notes,''))>500
     OR (_entry_type='adjustment' AND char_length(btrim(COALESCE(_notes,'')))=0) THEN
    RAISE EXCEPTION 'Invalid leave balance entry';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hr_employee_records
    WHERE business_id=_business_id AND user_id=_user_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.hr_leave_types
    WHERE business_id=_business_id AND id=_leave_type_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Employee or active leave type not found in this business';
  END IF;
  INSERT INTO public.hr_leave_balance_entries(
    business_id,user_id,leave_type_id,leave_year,entry_type,delta_days,notes,created_by
  ) VALUES (
    _business_id,_user_id,_leave_type_id,_leave_year,_entry_type,_delta_days,
    NULLIF(btrim(_notes),''),auth.uid()
  ) RETURNING id INTO v_entry;
  RETURN v_entry;
END;
$$;
REVOKE ALL ON FUNCTION public.hr_adjust_leave_balance(uuid,uuid,uuid,integer,text,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_adjust_leave_balance(uuid,uuid,uuid,integer,text,numeric,text) TO authenticated;

-- Normal leave approvals remain with existing HR managers. A balance override is stricter:
-- only the delegate for the affected employee's branch may submit its required reason.
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
BEGIN
  IF NEW.request_status <> 'approved'
     OR (TG_OP = 'UPDATE' AND OLD.request_status = 'approved') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NOT public.hr_is_manager(NEW.business_id) THEN
    RAISE EXCEPTION 'Only a business administrator can approve leave' USING ERRCODE='42501';
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
      IF NOT public.hr_is_leave_delegate(NEW.business_id, NEW.user_id) THEN
        RAISE EXCEPTION 'Only the delegated branch manager may approve a leave balance override'
          USING ERRCODE='42501';
      END IF;
      v_override_needed := true;
      v_override_available := LEAST(COALESCE(v_override_available,round(v_available,2)),round(v_available,2));
    END IF;
    v_year := v_year+1;
  END LOOP;

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

CREATE OR REPLACE FUNCTION public.hr_review_leave_request(
  _business_id uuid,
  _request_id uuid,
  _decision text,
  _review_note text DEFAULT NULL,
  _override_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_employee_user_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.hr_is_manager(_business_id) THEN
    RAISE EXCEPTION 'Only a business administrator can review leave' USING ERRCODE='42501';
  END IF;
  IF _decision NOT IN ('approved','rejected')
     OR char_length(COALESCE(_review_note,''))>500
     OR char_length(COALESCE(_override_reason,''))>500 THEN
    RAISE EXCEPTION 'Invalid leave review details';
  END IF;
  IF _override_reason IS NOT NULL AND char_length(btrim(_override_reason))=0 THEN
    RAISE EXCEPTION 'Override reason cannot be blank';
  END IF;

  IF _decision='approved' AND _override_reason IS NOT NULL THEN
    SELECT user_id INTO v_employee_user_id
    FROM public.hr_leave_requests
    WHERE business_id=_business_id AND id=_request_id AND request_status='pending';
    IF v_employee_user_id IS NULL
       OR NOT public.hr_is_leave_delegate(_business_id, v_employee_user_id) THEN
      RAISE EXCEPTION 'Only the delegated branch manager may submit a leave balance override'
        USING ERRCODE='42501';
    END IF;
  END IF;

  PERFORM set_config('app.hrm_leave_override_reason',
    CASE WHEN _decision='approved' THEN NULLIF(btrim(_override_reason),'') ELSE NULL END, true);

  UPDATE public.hr_leave_requests
     SET request_status=_decision, reviewed_by=auth.uid(), reviewed_at=now(),
         review_note=NULLIF(btrim(_review_note),''), updated_at=now()
   WHERE business_id=_business_id AND id=_request_id AND request_status='pending'
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'This request could not be reviewed. It may already have been processed.';
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.hr_review_leave_request(uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_review_leave_request(uuid,uuid,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.hr_is_leave_delegate(uuid,uuid) IS
  'True only for the authenticated user with an active delegation grant and branch access for the employee branch.';
COMMENT ON TABLE public.hr_leave_balance_entries IS
  'Append-only leave ledger. Readable only by the specifically delegated branch manager for the employee.';
COMMENT ON TABLE public.hr_leave_balance_overrides IS
  'Immutable leave override audit. Readable only by the specifically delegated branch manager for the employee.';
