-- 0064: enforce leave balances during approval with an audited administrator override.
-- The check and ledger posting run in the same transaction. Locking the employee row
-- serializes concurrent approvals for the same employee.

CREATE TABLE public.hr_leave_balance_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE REFERENCES public.hr_leave_requests(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  leave_type_id uuid NOT NULL,
  requested_days numeric(6,2) NOT NULL CHECK (requested_days > 0),
  available_days numeric(8,2) NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  approved_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id,user_id) REFERENCES public.hr_employee_records(business_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,leave_type_id) REFERENCES public.hr_leave_types(business_id,id) ON DELETE RESTRICT
);
ALTER TABLE public.hr_leave_balance_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_leave_balance_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hr_leave_balance_overrides TO authenticated;
CREATE POLICY hr_leave_balance_override_read ON public.hr_leave_balance_overrides
  FOR SELECT TO authenticated USING (public.hr_is_manager(business_id));

CREATE OR REPLACE FUNCTION public.hr_enforce_leave_balance_on_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_annual numeric(6,2);
  v_accrual text;
  v_year integer;
  v_last_year integer;
  v_total_days integer;
  v_overlap_days integer;
  v_allocated numeric(8,2) := 0;
  v_requested numeric(8,2);
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

  -- A row lock ensures two simultaneous approvals cannot spend the same balance.
  PERFORM 1 FROM public.hr_employee_records
   WHERE business_id=NEW.business_id AND user_id=NEW.user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee record not found';
  END IF;

  SELECT annual_quota, accrual_method
    INTO v_annual, v_accrual
    FROM public.hr_leave_types
   WHERE business_id=NEW.business_id AND id=NEW.leave_type_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active leave type not found';
  END IF;

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
        RAISE EXCEPTION 'Insufficient leave balance for %: requested % day(s), available % day(s). An administrator override with a reason is required.',
          v_year, v_delta, round(v_available,2)
          USING ERRCODE='P0001';
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
END; $$;
REVOKE ALL ON FUNCTION public.hr_enforce_leave_balance_on_approval() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hr_enforce_leave_balance_on_approval ON public.hr_leave_requests;
CREATE TRIGGER hr_enforce_leave_balance_on_approval
BEFORE INSERT OR UPDATE OF request_status ON public.hr_leave_requests
FOR EACH ROW EXECUTE FUNCTION public.hr_enforce_leave_balance_on_approval();

CREATE OR REPLACE FUNCTION public.hr_review_leave_request(
  _business_id uuid,
  _request_id uuid,
  _decision text,
  _review_note text DEFAULT NULL,
  _override_reason text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
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
END; $$;
REVOKE ALL ON FUNCTION public.hr_review_leave_request(uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_review_leave_request(uuid,uuid,text,text,text) TO authenticated;

COMMENT ON TABLE public.hr_leave_balance_overrides IS
  'Immutable audit of administrator approvals that exceeded the calculated leave balance. Reason and approving administrator are retained.';
COMMENT ON FUNCTION public.hr_review_leave_request(uuid,uuid,text,text,text) IS
  'Atomic administrator leave review. Approval is blocked for insufficient balance unless an explicit reason is supplied; the override is audited.';
