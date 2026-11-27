-- 0131: protect the rental owner membership and normalize payment precision.

CREATE OR REPLACE FUNCTION rental_private.assign_member(_workspace uuid,_user uuid,_role text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE result_id uuid;
BEGIN
  IF NOT rental_private.has_role(_workspace,'owner') THEN
    RAISE EXCEPTION 'Rental workspace owner access is required' USING ERRCODE='42501';
  END IF;
  IF _user=auth.uid()
     OR EXISTS (SELECT 1 FROM public.rental_memberships m WHERE m.workspace_id=_workspace AND m.user_id=_user AND m.role='owner') THEN
    RAISE EXCEPTION 'The rental workspace owner cannot be reassigned or demoted';
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

CREATE OR REPLACE FUNCTION rental_private.record_payment(
  _workspace uuid,_invoice uuid,_amount numeric,_date date,_method text,_reference text,_notes text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  inv public.rental_invoices%ROWTYPE;
  paid numeric(14,2);
  rounded_amount numeric(14,2);
  payment_id uuid;
BEGIN
  IF NOT rental_private.has_role(_workspace,'accountant') THEN
    RAISE EXCEPTION 'Rental accountant or owner access is required' USING ERRCODE='42501';
  END IF;
  IF _amount IS NULL OR round(_amount,2)<=0 OR _method NOT IN ('cash','bank_transfer','upi','qr','cheque','other') THEN
    RAISE EXCEPTION 'Invalid payment amount or method';
  END IF;
  rounded_amount := round(_amount,2);
  SELECT * INTO inv FROM public.rental_invoices
   WHERE workspace_id=_workspace AND id=_invoice FOR UPDATE;
  IF NOT FOUND OR inv.status NOT IN ('sent','partially_paid') THEN
    RAISE EXCEPTION 'Payment can only be recorded against a sent invoice';
  END IF;
  SELECT coalesce(sum(p.amount),0) INTO paid FROM public.rental_payments p
   WHERE p.workspace_id=_workspace AND p.invoice_id=_invoice;
  IF rounded_amount>inv.total-paid THEN RAISE EXCEPTION 'Payment exceeds the outstanding invoice balance'; END IF;
  INSERT INTO public.rental_payments(workspace_id,invoice_id,payment_date,amount,payment_method,reference,notes,recorded_by)
  VALUES (_workspace,_invoice,_date,rounded_amount,_method,_reference,_notes,auth.uid())
  RETURNING id INTO payment_id;
  UPDATE public.rental_invoices SET
    status=CASE WHEN paid+rounded_amount>=inv.total THEN 'paid' ELSE 'partially_paid' END,
    updated_at=now()
  WHERE id=_invoice AND workspace_id=_workspace;
  RETURN payment_id;
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
  v_invoice_year integer;
  prefix text;
  invoice_id uuid;
  invoice_total numeric(14,2);
  line_count integer;
BEGIN
  IF NOT rental_private.has_role(_workspace,'accountant') THEN
    RAISE EXCEPTION 'Rental accountant or owner access is required' USING ERRCODE='42501';
  END IF;
  IF _period_end < _period_start OR _lines IS NULL OR jsonb_typeof(_lines)<>'array' THEN
    RAISE EXCEPTION 'Invalid invoice period or line items';
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
  v_invoice_year := extract(year from _period_start)::integer;
  INSERT INTO public.rental_invoice_sequences(workspace_id,invoice_year,next_number)
  VALUES (_workspace,v_invoice_year,2)
  ON CONFLICT (workspace_id,invoice_year)
  DO UPDATE SET next_number=public.rental_invoice_sequences.next_number+1
  RETURNING next_number-1 INTO seq_no;
  INSERT INTO public.rental_invoices(
    workspace_id,invoice_number,tenant_id,unit_id,agreement_id,
    billing_period_start,billing_period_end,issue_date,due_date,
    subtotal,total,status,notes,created_by
  ) VALUES (
    _workspace,prefix||'-'||v_invoice_year::text||'-'||lpad(seq_no::text,3,'0'),
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
