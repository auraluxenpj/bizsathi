-- 0128: isolated rental property management workspace.
-- This module is deliberately separate from the AURALUXE business and its commerce ledgers.
-- It uses existing BizSathi profiles for accountant access, but has independent membership/RLS.

CREATE SCHEMA IF NOT EXISTS rental_private;
REVOKE ALL ON SCHEMA rental_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA rental_private TO authenticated;

CREATE TABLE public.rental_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Rental Property Management' CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  currency char(3) NOT NULL DEFAULT 'INR',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  invoice_prefix text NOT NULL DEFAULT 'RENT' CHECK (invoice_prefix ~ '^[A-Z0-9]{2,10}$'),
  due_day smallint NOT NULL DEFAULT 15 CHECK (due_day BETWEEN 1 AND 28),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_user_id)
);
CREATE UNIQUE INDEX rental_workspace_owner_unique
  ON public.rental_workspaces(owner_user_id) WHERE archived_at IS NULL;

CREATE TABLE public.rental_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner','accountant','viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,user_id)
);
CREATE INDEX rental_memberships_user_idx ON public.rental_memberships(user_id,status);

CREATE TABLE public.rental_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  address text,
  city text,
  state text,
  postal_code text,
  country text NOT NULL DEFAULT 'India',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,id)
);
CREATE INDEX rental_properties_workspace_idx ON public.rental_properties(workspace_id,is_active);

CREATE TABLE public.rental_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  unit_code text NOT NULL CHECK (char_length(btrim(unit_code)) BETWEEN 1 AND 60),
  floor_label text,
  status text NOT NULL DEFAULT 'vacant' CHECK (status IN ('vacant','occupied','maintenance')),
  monthly_rent numeric(14,2) NOT NULL DEFAULT 0 CHECK (monthly_rent >= 0),
  security_deposit numeric(14,2) NOT NULL DEFAULT 0 CHECK (security_deposit >= 0),
  due_day smallint NOT NULL DEFAULT 15 CHECK (due_day BETWEEN 1 AND 28),
  electricity_rate numeric(12,4) NOT NULL DEFAULT 0 CHECK (electricity_rate >= 0),
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,id),
  UNIQUE (property_id,unit_code),
  FOREIGN KEY (workspace_id,property_id) REFERENCES public.rental_properties(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX rental_units_workspace_idx ON public.rental_units(workspace_id,property_id,status);

CREATE TABLE public.rental_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 160),
  phone text,
  whatsapp_number text,
  email text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,id)
);
CREATE INDEX rental_tenants_workspace_idx ON public.rental_tenants(workspace_id,status,full_name);

CREATE TABLE public.rental_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  unit_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  agreement_ref text,
  start_date date NOT NULL,
  end_date date,
  monthly_rent numeric(14,2) NOT NULL CHECK (monthly_rent >= 0),
  security_deposit numeric(14,2) NOT NULL DEFAULT 0 CHECK (security_deposit >= 0),
  due_day smallint NOT NULL DEFAULT 15 CHECK (due_day BETWEEN 1 AND 28),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','draft')),
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,id),
  FOREIGN KEY (workspace_id,unit_id) REFERENCES public.rental_units(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,tenant_id) REFERENCES public.rental_tenants(workspace_id,id) ON DELETE RESTRICT,
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX rental_one_active_agreement_per_unit
  ON public.rental_agreements(workspace_id,unit_id) WHERE status='active';
CREATE INDEX rental_agreements_workspace_period_idx ON public.rental_agreements(workspace_id,status,start_date,end_date);

CREATE TABLE public.rental_charge_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[a-z0-9_]{2,40}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  category text NOT NULL CHECK (category IN ('water','maintenance','parking','cleaning','other')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,code)
);

CREATE TABLE public.rental_charge_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  unit_id uuid,
  charge_type_id uuid NOT NULL,
  allocation_method text NOT NULL CHECK (allocation_method IN ('fixed','equal','percentage')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  allocation_percent numeric(7,4),
  is_recurring boolean NOT NULL DEFAULT true,
  start_date date NOT NULL DEFAULT current_date,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id,property_id) REFERENCES public.rental_properties(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,unit_id) REFERENCES public.rental_units(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,charge_type_id) REFERENCES public.rental_charge_types(workspace_id,id) ON DELETE RESTRICT,
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK (
    (allocation_method='equal' AND unit_id IS NULL AND allocation_percent IS NULL)
    OR (allocation_method='fixed' AND unit_id IS NOT NULL AND allocation_percent IS NULL)
    OR (allocation_method='percentage' AND unit_id IS NOT NULL AND allocation_percent > 0 AND allocation_percent <= 100)
  )
);
CREATE INDEX rental_charge_rules_period_idx ON public.rental_charge_rules(workspace_id,property_id,is_active,start_date,end_date);

CREATE TABLE public.rental_meter_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  unit_id uuid NOT NULL,
  meter_type text NOT NULL DEFAULT 'electricity' CHECK (meter_type IN ('electricity','water')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  previous_reading numeric(14,3) NOT NULL CHECK (previous_reading >= 0),
  current_reading numeric(14,3) NOT NULL CHECK (current_reading >= previous_reading),
  units_consumed numeric(14,3) GENERATED ALWAYS AS (current_reading-previous_reading) STORED,
  rate_per_unit numeric(12,4) NOT NULL CHECK (rate_per_unit >= 0),
  charge_amount numeric(14,2) GENERATED ALWAYS AS (round((current_reading-previous_reading)*rate_per_unit,2)) STORED,
  read_at date NOT NULL DEFAULT current_date,
  notes text,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,unit_id,meter_type,period_start,period_end),
  FOREIGN KEY (workspace_id,unit_id) REFERENCES public.rental_units(workspace_id,id) ON DELETE RESTRICT,
  CHECK (period_end >= period_start)
);
CREATE INDEX rental_meter_readings_period_idx ON public.rental_meter_readings(workspace_id,period_start,period_end,unit_id);

CREATE TABLE public.rental_invoice_sequences (
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  invoice_year integer NOT NULL,
  next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
  PRIMARY KEY (workspace_id,invoice_year)
);

CREATE TABLE public.rental_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  invoice_number text NOT NULL,
  tenant_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  billing_period_start date NOT NULL,
  billing_period_end date NOT NULL,
  issue_date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL,
  subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  total numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('draft','pending_approval','approved','sent','partially_paid','paid','void')),
  notes text,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  sent_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sent_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,invoice_number),
  FOREIGN KEY (workspace_id,tenant_id) REFERENCES public.rental_tenants(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,unit_id) REFERENCES public.rental_units(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,agreement_id) REFERENCES public.rental_agreements(workspace_id,id) ON DELETE RESTRICT,
  CHECK (billing_period_end >= billing_period_start)
);
CREATE UNIQUE INDEX rental_invoice_period_unique
  ON public.rental_invoices(workspace_id,agreement_id,billing_period_start,billing_period_end)
  WHERE status <> 'void';
CREATE INDEX rental_invoices_workspace_status_idx ON public.rental_invoices(workspace_id,status,due_date);

CREATE TABLE public.rental_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL,
  charge_type_id uuid,
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 180),
  category text NOT NULL CHECK (category IN ('rent','electricity','water','maintenance','parking','cleaning','other')),
  quantity numeric(14,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_rate numeric(14,4) NOT NULL DEFAULT 0 CHECK (unit_rate >= 0),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (amount=round(quantity*unit_rate,2)),
  FOREIGN KEY (workspace_id,invoice_id) REFERENCES public.rental_invoices(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,charge_type_id) REFERENCES public.rental_charge_types(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX rental_invoice_lines_invoice_idx ON public.rental_invoice_lines(workspace_id,invoice_id);

CREATE TABLE public.rental_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL,
  payment_date date NOT NULL DEFAULT current_date,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('cash','bank_transfer','upi','qr','cheque','other')),
  reference text,
  notes text,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id,invoice_id) REFERENCES public.rental_invoices(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX rental_payments_invoice_idx ON public.rental_payments(workspace_id,invoice_id,payment_date);

CREATE TABLE public.rental_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  unit_id uuid,
  category text NOT NULL CHECK (category IN ('repairs','maintenance','utilities','taxes','insurance','cleaning','other')),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 180),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  expense_date date NOT NULL DEFAULT current_date,
  payment_method text CHECK (payment_method IN ('cash','bank_transfer','upi','qr','cheque','other')),
  reference text,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id,property_id) REFERENCES public.rental_properties(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,unit_id) REFERENCES public.rental_units(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX rental_expenses_period_idx ON public.rental_expenses(workspace_id,expense_date,property_id);

CREATE TABLE public.rental_deposit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  agreement_id uuid,
  transaction_type text NOT NULL CHECK (transaction_type IN ('received','refunded','adjustment')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  transaction_date date NOT NULL DEFAULT current_date,
  payment_method text CHECK (payment_method IN ('cash','bank_transfer','upi','qr','cheque','other')),
  reference text,
  notes text,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id,tenant_id) REFERENCES public.rental_tenants(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,unit_id) REFERENCES public.rental_units(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,agreement_id) REFERENCES public.rental_agreements(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX rental_deposits_tenant_idx ON public.rental_deposit_transactions(workspace_id,tenant_id,transaction_date);

CREATE TABLE public.rental_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  entity_table text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_audit_events_workspace_idx ON public.rental_audit_events(workspace_id,created_at DESC);

CREATE OR REPLACE FUNCTION rental_private.is_member(_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.rental_memberships m
    JOIN public.rental_workspaces w ON w.id=m.workspace_id AND w.archived_at IS NULL
    WHERE m.workspace_id=_workspace AND m.user_id=auth.uid() AND m.status='active'
  );
$fn$;

CREATE OR REPLACE FUNCTION rental_private.has_role(_workspace uuid,_minimum text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.rental_workspaces w WHERE w.id=_workspace AND w.archived_at IS NULL)
    AND CASE _minimum
      WHEN 'owner' THEN EXISTS (SELECT 1 FROM public.rental_memberships m WHERE m.workspace_id=_workspace AND m.user_id=auth.uid() AND m.status='active' AND m.role='owner')
      WHEN 'accountant' THEN EXISTS (SELECT 1 FROM public.rental_memberships m WHERE m.workspace_id=_workspace AND m.user_id=auth.uid() AND m.status='active' AND m.role IN ('owner','accountant'))
      WHEN 'viewer' THEN rental_private.is_member(_workspace)
      ELSE false
    END;
$fn$;

CREATE OR REPLACE FUNCTION rental_private.can_edit_invoice(_workspace uuid,_invoice uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.rental_invoices i
    WHERE i.workspace_id=_workspace AND i.id=_invoice
      AND i.status IN ('draft','pending_approval')
      AND rental_private.has_role(_workspace,'accountant')
  );
$fn$;

CREATE OR REPLACE FUNCTION rental_private.refresh_invoice_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE target_workspace uuid := NEW.workspace_id;
        target_invoice uuid := NEW.invoice_id;
BEGIN
  UPDATE public.rental_invoices i
     SET subtotal=coalesce((SELECT sum(l.amount) FROM public.rental_invoice_lines l
                            WHERE l.workspace_id=target_workspace AND l.invoice_id=target_invoice),0),
         total=coalesce((SELECT sum(l.amount) FROM public.rental_invoice_lines l
                         WHERE l.workspace_id=target_workspace AND l.invoice_id=target_invoice),0),
         updated_at=now()
   WHERE i.workspace_id=target_workspace AND i.id=target_invoice
     AND i.status IN ('draft','pending_approval');
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER rental_invoice_lines_recalculate
  AFTER INSERT OR UPDATE ON public.rental_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION rental_private.refresh_invoice_totals();

CREATE OR REPLACE FUNCTION rental_private.audit_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  row_data jsonb;
  before_row jsonb;
BEGIN
  row_data := to_jsonb(NEW);
  IF TG_OP='UPDATE' THEN before_row := to_jsonb(OLD); END IF;
  INSERT INTO public.rental_audit_events(workspace_id,actor_id,entity_table,entity_id,action,before_data,after_data)
  VALUES ((row_data->>'workspace_id')::uuid,auth.uid(),TG_TABLE_NAME,(row_data->>'id')::uuid,TG_OP,before_row,row_data);
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION rental_private.create_workspace(_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE result_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Platform owner access is required to create the rental workspace' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  SELECT id INTO result_id FROM public.rental_workspaces WHERE owner_user_id=auth.uid() AND archived_at IS NULL;
  IF result_id IS NOT NULL THEN RETURN result_id; END IF;
  INSERT INTO public.rental_workspaces(name,owner_user_id)
  VALUES (coalesce(nullif(btrim(_name),''),'Rental Property Management'),auth.uid())
  RETURNING id INTO result_id;
  INSERT INTO public.rental_memberships(workspace_id,user_id,role,status,created_by)
  VALUES (result_id,auth.uid(),'owner','active',auth.uid());
  RETURN result_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION rental_private.assign_member(_workspace uuid,_user uuid,_role text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE result_id uuid;
BEGIN
  IF NOT rental_private.has_role(_workspace,'owner') THEN
    RAISE EXCEPTION 'Rental workspace owner access is required' USING ERRCODE='42501';
  END IF;
  IF _role NOT IN ('accountant','viewer') OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=_user) THEN
    RAISE EXCEPTION 'Select an existing BizSathi employee account and a permitted role';
  END IF;
  INSERT INTO public.rental_memberships(workspace_id,user_id,role,status,created_by)
  VALUES (_workspace,_user,_role,'active',auth.uid())
  ON CONFLICT (workspace_id,user_id) DO UPDATE SET role=excluded.role,status='active',updated_at=now()
  RETURNING id INTO result_id;
  RETURN result_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION rental_private.create_invoice(
  _workspace uuid,_tenant uuid,_unit uuid,_agreement uuid,
  _period_start date,_period_end date,_issue_date date,_due_date date,
  _notes text,_lines jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  seq_no bigint;
  invoice_year integer;
  prefix text;
  invoice_id uuid;
  invoice_total numeric(14,2);
  line_count integer;
BEGIN
  IF NOT rental_private.has_role(_workspace,'accountant') THEN
    RAISE EXCEPTION 'Rental accountant or owner access is required' USING ERRCODE='42501';
  END IF;
  IF _period_end < _period_start OR jsonb_typeof(_lines)<>'array' THEN
    RAISE EXCEPTION 'Invalid invoice period, due date or line items';
  END IF;
  line_count := jsonb_array_length(_lines);
  IF line_count < 1 OR line_count > 50 THEN RAISE EXCEPTION 'Invoice must contain between 1 and 50 lines'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.rental_agreements a
    WHERE a.workspace_id=_workspace AND a.id=_agreement AND a.unit_id=_unit AND a.tenant_id=_tenant
  ) THEN RAISE EXCEPTION 'Tenant, unit and agreement do not match'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.rental_invoices i
    WHERE i.workspace_id=_workspace AND i.agreement_id=_agreement
      AND i.billing_period_start=_period_start AND i.billing_period_end=_period_end AND i.status<>'void'
  ) THEN
    SELECT i.id INTO invoice_id FROM public.rental_invoices i
    WHERE i.workspace_id=_workspace AND i.agreement_id=_agreement
      AND i.billing_period_start=_period_start AND i.billing_period_end=_period_end AND i.status<>'void';
    RETURN invoice_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_lines) x
    WHERE coalesce((x->>'quantity')::numeric,0)<=0
       OR coalesce((x->>'unit_rate')::numeric,0)<0
       OR nullif(btrim(x->>'description'),'') IS NULL
  ) THEN RAISE EXCEPTION 'Invoice line values are invalid'; END IF;
  SELECT round(sum(round(coalesce((x->>'quantity')::numeric,1)*coalesce((x->>'unit_rate')::numeric,0),2)),2)
    INTO invoice_total FROM jsonb_array_elements(_lines) x;
  SELECT invoice_prefix INTO prefix FROM public.rental_workspaces WHERE id=_workspace;
  invoice_year := extract(year from _period_start)::integer;
  INSERT INTO public.rental_invoice_sequences(workspace_id,invoice_year,next_number)
  VALUES (_workspace,invoice_year,2)
  ON CONFLICT (workspace_id,invoice_year)
  DO UPDATE SET next_number=public.rental_invoice_sequences.next_number+1
  RETURNING next_number-1 INTO seq_no;
  INSERT INTO public.rental_invoices(
    workspace_id,invoice_number,tenant_id,unit_id,agreement_id,
    billing_period_start,billing_period_end,issue_date,due_date,
    subtotal,total,status,notes,created_by
  ) VALUES (
    _workspace,prefix||'-'||invoice_year::text||'-'||lpad(seq_no::text,3,'0'),
    _tenant,_unit,_agreement,_period_start,_period_end,_issue_date,_due_date,
    invoice_total,invoice_total,'pending_approval',_notes,auth.uid()
  ) RETURNING id INTO invoice_id;
  INSERT INTO public.rental_invoice_lines(
    workspace_id,invoice_id,charge_type_id,description,category,quantity,unit_rate,amount
  )
  SELECT _workspace,invoice_id,nullif(x->>'charge_type_id','')::uuid,
    btrim(x->>'description'),coalesce(x->>'category','other'),
    coalesce((x->>'quantity')::numeric,1),coalesce((x->>'unit_rate')::numeric,0),
    round(coalesce((x->>'quantity')::numeric,1)*coalesce((x->>'unit_rate')::numeric,0),2)
  FROM jsonb_array_elements(_lines) x;
  RETURN invoice_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION rental_private.approve_invoice(_workspace uuid,_invoice uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF NOT rental_private.has_role(_workspace,'owner') THEN
    RAISE EXCEPTION 'Only the rental workspace owner can approve invoices' USING ERRCODE='42501';
  END IF;
  UPDATE public.rental_invoices
     SET status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now()
   WHERE workspace_id=_workspace AND id=_invoice AND status='pending_approval';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only pending invoices can be approved'; END IF;
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION rental_private.mark_invoice_sent(_workspace uuid,_invoice uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF NOT rental_private.has_role(_workspace,'owner') THEN
    RAISE EXCEPTION 'Only the rental workspace owner can send invoices' USING ERRCODE='42501';
  END IF;
  UPDATE public.rental_invoices
     SET status='sent',sent_by=auth.uid(),sent_at=now(),updated_at=now()
   WHERE workspace_id=_workspace AND id=_invoice AND status='approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only approved invoices can be sent'; END IF;
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION rental_private.record_payment(
  _workspace uuid,_invoice uuid,_amount numeric,_date date,_method text,_reference text,_notes text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  inv public.rental_invoices%ROWTYPE;
  paid numeric(14,2);
  payment_id uuid;
BEGIN
  IF NOT rental_private.has_role(_workspace,'accountant') THEN
    RAISE EXCEPTION 'Rental accountant or owner access is required' USING ERRCODE='42501';
  END IF;
  IF _amount<=0 OR _method NOT IN ('cash','bank_transfer','upi','qr','cheque','other') THEN
    RAISE EXCEPTION 'Invalid payment amount or method';
  END IF;
  SELECT * INTO inv FROM public.rental_invoices
   WHERE workspace_id=_workspace AND id=_invoice FOR UPDATE;
  IF NOT FOUND OR inv.status NOT IN ('sent','partially_paid') THEN
    RAISE EXCEPTION 'Payment can only be recorded against a sent invoice';
  END IF;
  SELECT coalesce(sum(p.amount),0) INTO paid FROM public.rental_payments p
   WHERE p.workspace_id=_workspace AND p.invoice_id=_invoice;
  IF round(_amount,2)>inv.total-paid THEN RAISE EXCEPTION 'Payment exceeds the outstanding invoice balance'; END IF;
  INSERT INTO public.rental_payments(workspace_id,invoice_id,payment_date,amount,payment_method,reference,notes,recorded_by)
  VALUES (_workspace,_invoice,_date,round(_amount,2),_method,_reference,_notes,auth.uid())
  RETURNING id INTO payment_id;
  UPDATE public.rental_invoices SET
    status=CASE WHEN paid+_amount>=inv.total THEN 'paid' ELSE 'partially_paid' END,
    updated_at=now()
  WHERE id=_invoice AND workspace_id=_workspace;
  RETURN payment_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_rental_workspace(_name text DEFAULT 'Rental Property Management')
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT rental_private.create_workspace(_name); $fn$;
CREATE OR REPLACE FUNCTION public.assign_rental_member(_workspace uuid,_user uuid,_role text)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT rental_private.assign_member(_workspace,_user,_role); $fn$;
CREATE OR REPLACE FUNCTION public.create_rental_invoice(
  _workspace uuid,_tenant uuid,_unit uuid,_agreement uuid,
  _period_start date,_period_end date,_issue_date date,_due_date date,
  _notes text,_lines jsonb
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT rental_private.create_invoice(_workspace,_tenant,_unit,_agreement,_period_start,_period_end,_issue_date,_due_date,_notes,_lines); $fn$;
CREATE OR REPLACE FUNCTION public.approve_rental_invoice(_workspace uuid,_invoice uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT rental_private.approve_invoice(_workspace,_invoice); $fn$;
CREATE OR REPLACE FUNCTION public.mark_rental_invoice_sent(_workspace uuid,_invoice uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT rental_private.mark_invoice_sent(_workspace,_invoice); $fn$;
CREATE OR REPLACE FUNCTION public.record_rental_payment(
  _workspace uuid,_invoice uuid,_amount numeric,_date date DEFAULT current_date,
  _method text DEFAULT 'bank_transfer',_reference text DEFAULT NULL,_notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT rental_private.record_payment(_workspace,_invoice,_amount,_date,_method,_reference,_notes); $fn$;

DO $audit_triggers$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'rental_properties','rental_units','rental_tenants','rental_agreements',
    'rental_charge_types','rental_charge_rules','rental_meter_readings',
    'rental_invoices','rental_invoice_lines','rental_payments','rental_expenses','rental_deposit_transactions'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION rental_private.audit_row()',tbl,tbl);
  END LOOP;
END;
$audit_triggers$;

ALTER TABLE public.rental_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_charge_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_charge_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_meter_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_invoice_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_deposit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY rental_workspaces_select ON public.rental_workspaces
  FOR SELECT TO authenticated USING (rental_private.is_member(id) OR public.is_platform_owner());
CREATE POLICY rental_workspaces_update ON public.rental_workspaces
  FOR UPDATE TO authenticated USING (rental_private.has_role(id,'owner'))
  WITH CHECK (rental_private.has_role(id,'owner'));

CREATE POLICY rental_memberships_select ON public.rental_memberships
  FOR SELECT TO authenticated USING (user_id=auth.uid() OR rental_private.has_role(workspace_id,'owner'));

CREATE POLICY rental_properties_access ON public.rental_properties
  FOR SELECT TO authenticated USING (rental_private.is_member(workspace_id));
CREATE POLICY rental_properties_insert ON public.rental_properties
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant'));
CREATE POLICY rental_properties_update ON public.rental_properties
  FOR UPDATE TO authenticated USING (rental_private.has_role(workspace_id,'accountant'))
  WITH CHECK (rental_private.has_role(workspace_id,'accountant'));

CREATE POLICY rental_units_access ON public.rental_units
  FOR SELECT TO authenticated USING (rental_private.is_member(workspace_id));
CREATE POLICY rental_units_insert ON public.rental_units
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant'));
CREATE POLICY rental_units_update ON public.rental_units
  FOR UPDATE TO authenticated USING (rental_private.has_role(workspace_id,'accountant'))
  WITH CHECK (rental_private.has_role(workspace_id,'accountant'));

CREATE POLICY rental_tenants_access ON public.rental_tenants
  FOR SELECT TO authenticated USING (rental_private.is_member(workspace_id));
CREATE POLICY rental_tenants_insert ON public.rental_tenants
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant'));
CREATE POLICY rental_tenants_update ON public.rental_tenants
  FOR UPDATE TO authenticated USING (rental_private.has_role(workspace_id,'accountant'))
  WITH CHECK (rental_private.has_role(workspace_id,'accountant'));

CREATE POLICY rental_agreements_access ON public.rental_agreements
  FOR SELECT TO authenticated USING (rental_private.is_member(workspace_id));
CREATE POLICY rental_agreements_insert ON public.rental_agreements
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant'));
CREATE POLICY rental_agreements_update ON public.rental_agreements
  FOR UPDATE TO authenticated USING (rental_private.has_role(workspace_id,'accountant'))
  WITH CHECK (rental_private.has_role(workspace_id,'accountant'));

CREATE POLICY rental_charge_types_access ON public.rental_charge_types
  FOR SELECT TO authenticated USING (rental_private.is_member(workspace_id));
CREATE POLICY rental_charge_types_insert ON public.rental_charge_types
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant'));
CREATE POLICY rental_charge_types_update ON public.rental_charge_types
  FOR UPDATE TO authenticated USING (rental_private.has_role(workspace_id,'accountant'))
  WITH CHECK (rental_private.has_role(workspace_id,'accountant'));

CREATE POLICY rental_charge_rules_access ON public.rental_charge_rules
  FOR SELECT TO authenticated USING (rental_private.is_member(workspace_id));
CREATE POLICY rental_charge_rules_insert ON public.rental_charge_rules
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant'));
CREATE POLICY rental_charge_rules_update ON public.rental_charge_rules
  FOR UPDATE TO authenticated USING (rental_private.has_role(workspace_id,'accountant'))
  WITH CHECK (rental_private.has_role(workspace_id,'accountant'));

CREATE POLICY rental_meter_readings_access ON public.rental_meter_readings
  FOR SELECT TO authenticated USING (rental_private.is_member(workspace_id));
CREATE POLICY rental_meter_readings_insert ON public.rental_meter_readings
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant'));
CREATE POLICY rental_meter_readings_update ON public.rental_meter_readings
  FOR UPDATE TO authenticated USING (rental_private.has_role(workspace_id,'accountant'))
  WITH CHECK (rental_private.has_role(workspace_id,'accountant'));

CREATE POLICY rental_invoices_access ON public.rental_invoices
  FOR SELECT TO authenticated USING (rental_private.is_member(workspace_id));
CREATE POLICY rental_invoices_insert ON public.rental_invoices
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant'));
CREATE POLICY rental_invoices_update ON public.rental_invoices
  FOR UPDATE TO authenticated
  USING (rental_private.has_role(workspace_id,'owner') OR rental_private.can_edit_invoice(workspace_id,id))
  WITH CHECK (
    rental_private.has_role(workspace_id,'owner')
    OR (rental_private.has_role(workspace_id,'accountant') AND status IN ('draft','pending_approval'))
  );

CREATE POLICY rental_invoice_lines_access ON public.rental_invoice_lines
  FOR SELECT TO authenticated USING (rental_private.is_member(workspace_id));
CREATE POLICY rental_invoice_lines_insert ON public.rental_invoice_lines
  FOR INSERT TO authenticated WITH CHECK (
    rental_private.has_role(workspace_id,'accountant')
    AND rental_private.can_edit_invoice(workspace_id,invoice_id)
  );
CREATE POLICY rental_invoice_lines_update ON public.rental_invoice_lines
  FOR UPDATE TO authenticated
  USING (rental_private.can_edit_invoice(workspace_id,invoice_id))
  WITH CHECK (rental_private.can_edit_invoice(workspace_id,invoice_id));

CREATE POLICY rental_payments_access ON public.rental_payments
  FOR SELECT TO authenticated USING (rental_private.is_member(workspace_id));

CREATE POLICY rental_expenses_access ON public.rental_expenses
  FOR SELECT TO authenticated USING (rental_private.is_member(workspace_id));
CREATE POLICY rental_expenses_insert ON public.rental_expenses
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant'));
CREATE POLICY rental_expenses_update ON public.rental_expenses
  FOR UPDATE TO authenticated USING (rental_private.has_role(workspace_id,'accountant'))
  WITH CHECK (rental_private.has_role(workspace_id,'accountant'));

CREATE POLICY rental_deposit_transactions_access ON public.rental_deposit_transactions
  FOR SELECT TO authenticated USING (rental_private.is_member(workspace_id));
CREATE POLICY rental_deposit_transactions_insert ON public.rental_deposit_transactions
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant'));

CREATE POLICY rental_audit_events_access ON public.rental_audit_events
  FOR SELECT TO authenticated USING (rental_private.has_role(workspace_id,'owner'));

REVOKE ALL ON TABLE
  public.rental_workspaces,public.rental_memberships,public.rental_properties,public.rental_units,
  public.rental_tenants,public.rental_agreements,public.rental_charge_types,public.rental_charge_rules,
  public.rental_meter_readings,public.rental_invoice_sequences,public.rental_invoices,
  public.rental_invoice_lines,public.rental_payments,public.rental_expenses,
  public.rental_deposit_transactions,public.rental_audit_events
FROM PUBLIC,anon,authenticated;

GRANT SELECT,UPDATE ON public.rental_workspaces TO authenticated;
GRANT SELECT ON public.rental_memberships TO authenticated;
GRANT SELECT,INSERT,UPDATE ON
  public.rental_properties,public.rental_units,public.rental_tenants,public.rental_agreements,
  public.rental_charge_types,public.rental_charge_rules,public.rental_meter_readings,
  public.rental_invoice_lines,public.rental_expenses
TO authenticated;
GRANT SELECT,UPDATE (due_date,notes) ON public.rental_invoices TO authenticated;
GRANT SELECT,INSERT ON public.rental_deposit_transactions TO authenticated;
GRANT SELECT ON public.rental_payments,public.rental_audit_events TO authenticated;
REVOKE ALL ON public.rental_invoice_sequences FROM PUBLIC,anon,authenticated;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA rental_private FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rental_private.is_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rental_private.has_role(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION rental_private.can_edit_invoice(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rental_private.create_workspace(text) TO authenticated;
GRANT EXECUTE ON FUNCTION rental_private.assign_member(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION rental_private.create_invoice(uuid,uuid,uuid,uuid,date,date,date,date,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION rental_private.approve_invoice(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rental_private.mark_invoice_sent(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rental_private.record_payment(uuid,uuid,numeric,date,text,text,text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_rental_workspace(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.assign_rental_member(uuid,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.create_rental_invoice(uuid,uuid,uuid,uuid,date,date,date,date,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.approve_rental_invoice(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mark_rental_invoice_sent(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.record_rental_payment(uuid,uuid,numeric,date,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_rental_workspace(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_rental_member(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_rental_invoice(uuid,uuid,uuid,uuid,date,date,date,date,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_rental_invoice(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_rental_invoice_sent(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_rental_payment(uuid,uuid,numeric,date,text,text,text) TO authenticated;

COMMENT ON TABLE public.rental_workspaces IS 'Independent rental property workspace; separate from AURALUXE commerce and accounting records.';
COMMENT ON TABLE public.rental_invoice_sequences IS 'Private per-workspace, per-year RENT invoice numbering sequence.';
COMMENT ON TABLE public.rental_audit_events IS 'Append-only audit history for rental property, tenant, utility, invoice and expense changes.';
