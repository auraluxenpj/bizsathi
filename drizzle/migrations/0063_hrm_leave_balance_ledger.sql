-- 0063: auditable leave balance ledger with controlled opening/carry-forward adjustments.
-- Append-only: approved leave consumes balance automatically; administrators post corrections explicitly.

CREATE TABLE public.hr_leave_balance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  leave_type_id uuid NOT NULL,
  leave_year integer NOT NULL CHECK (leave_year BETWEEN 2000 AND 2200),
  entry_type text NOT NULL CHECK (entry_type IN (
    'opening_balance','carry_forward','adjustment','leave_taken','leave_reversal'
  )),
  delta_days numeric(8,2) NOT NULL CHECK (delta_days <> 0 AND delta_days BETWEEN -3660 AND 3660),
  source_request_id uuid REFERENCES public.hr_leave_requests(id) ON DELETE RESTRICT,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id,user_id) REFERENCES public.hr_employee_records(business_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,leave_type_id) REFERENCES public.hr_leave_types(business_id,id) ON DELETE RESTRICT,
  CHECK (
    (entry_type IN ('leave_taken','leave_reversal') AND source_request_id IS NOT NULL)
    OR (entry_type IN ('opening_balance','carry_forward','adjustment') AND source_request_id IS NULL)
  )
);
CREATE INDEX hr_leave_balance_employee_idx
  ON public.hr_leave_balance_entries(business_id,user_id,leave_type_id,leave_year,created_at DESC);
CREATE UNIQUE INDEX hr_leave_balance_request_entry_uq
  ON public.hr_leave_balance_entries(source_request_id,entry_type)
  WHERE source_request_id IS NOT NULL;

ALTER TABLE public.hr_leave_balance_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_leave_balance_entries FROM anon;
GRANT SELECT ON public.hr_leave_balance_entries TO authenticated;
CREATE POLICY hr_leave_balance_read ON public.hr_leave_balance_entries FOR SELECT TO authenticated
  USING (public.hr_is_manager(business_id) OR user_id=auth.uid());

-- Only a business administrator can post opening balances, carry-forward, or adjustments.
-- The table has no client INSERT/UPDATE/DELETE grants; this RPC is the controlled write path.
CREATE OR REPLACE FUNCTION public.hr_adjust_leave_balance(
  _business_id uuid,
  _user_id uuid,
  _leave_type_id uuid,
  _leave_year integer,
  _entry_type text,
  _delta_days numeric,
  _notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.hr_is_manager(_business_id) THEN
    RAISE EXCEPTION 'Only a business administrator can adjust leave balances' USING ERRCODE='42501';
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
END; $$;
REVOKE ALL ON FUNCTION public.hr_adjust_leave_balance(uuid,uuid,uuid,integer,text,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hr_adjust_leave_balance(uuid,uuid,uuid,integer,text,numeric,text) TO authenticated;

-- Record approved leave in the ledger once, allocating multi-year requests by calendar-day overlap.
CREATE OR REPLACE FUNCTION public.hr_record_approved_leave_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year integer;
  v_last_year integer;
  v_total_days integer;
  v_overlap_days integer;
  v_allocated numeric(8,2) := 0;
  v_delta numeric(8,2);
BEGIN
  IF NEW.request_status <> 'approved'
     OR (TG_OP='UPDATE' AND OLD.request_status='approved') THEN
    RETURN NEW;
  END IF;
  v_total_days := (NEW.end_date-NEW.start_date)+1;
  v_year := extract(year FROM NEW.start_date)::integer;
  v_last_year := extract(year FROM NEW.end_date)::integer;
  WHILE v_year <= v_last_year LOOP
    v_overlap_days := (
      LEAST(NEW.end_date,make_date(v_year,12,31))
      - GREATEST(NEW.start_date,make_date(v_year,1,1))
    )+1;
    IF v_year=v_last_year THEN
      v_delta := round(-NEW.days-v_allocated,2);
    ELSE
      v_delta := round(-NEW.days*v_overlap_days/v_total_days,2);
      v_allocated := v_allocated+v_delta;
    END IF;
    IF v_delta <> 0 THEN
      INSERT INTO public.hr_leave_balance_entries(
        business_id,user_id,leave_type_id,leave_year,entry_type,delta_days,
        source_request_id,notes,created_by
      ) VALUES (
        NEW.business_id,NEW.user_id,NEW.leave_type_id,v_year,'leave_taken',
        v_delta,NEW.id,'Approved leave request',COALESCE(NEW.reviewed_by,NEW.user_id)
      ) ON CONFLICT (source_request_id,entry_type) WHERE source_request_id IS NOT NULL DO NOTHING;
    END IF;
    v_year := v_year+1;
  END LOOP;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.hr_record_approved_leave_balance() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS hr_record_approved_leave_balance ON public.hr_leave_requests;
CREATE TRIGGER hr_record_approved_leave_balance
AFTER INSERT OR UPDATE OF request_status ON public.hr_leave_requests
FOR EACH ROW EXECUTE FUNCTION public.hr_record_approved_leave_balance();

COMMENT ON TABLE public.hr_leave_balance_entries IS
  'Append-only, tenant-scoped leave balance ledger. Positive entries add days; negative entries consume days. Approved leave is posted automatically.';
COMMENT ON FUNCTION public.hr_adjust_leave_balance(uuid,uuid,uuid,integer,text,numeric,text) IS
  'Administrator-only append operation for opening balances, carry-forward, and documented adjustments. Never edits historical ledger entries.';
