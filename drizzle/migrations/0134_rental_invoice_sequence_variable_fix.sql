-- 0134: resolve the invoice-year variable/column ambiguity in invoice sequence allocation.

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
