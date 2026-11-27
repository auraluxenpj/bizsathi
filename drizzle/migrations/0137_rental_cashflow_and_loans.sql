-- Rental cash flow: supplemental receipts and property loan/EMI tracking.
CREATE TABLE public.rental_other_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  unit_id uuid,
  category text NOT NULL CHECK (category IN ('parking','late_fee','interest','miscellaneous','other')),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 180),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  received_date date NOT NULL DEFAULT current_date,
  payment_method text CHECK (payment_method IN ('cash','bank_transfer','upi','qr','cheque','other')),
  reference text,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id,property_id) REFERENCES public.rental_properties(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,unit_id) REFERENCES public.rental_units(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX rental_other_income_period_idx ON public.rental_other_income(workspace_id,received_date,property_id);
CREATE TABLE public.rental_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  lender text NOT NULL CHECK (char_length(btrim(lender)) BETWEEN 1 AND 160),
  loan_reference text,
  original_principal numeric(14,2) NOT NULL CHECK (original_principal > 0),
  emi_amount numeric(14,2) NOT NULL CHECK (emi_amount > 0),
  start_date date NOT NULL,
  next_due_date date NOT NULL,
  frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly','quarterly')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,id),
  FOREIGN KEY (workspace_id,property_id) REFERENCES public.rental_properties(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX rental_loans_workspace_idx ON public.rental_loans(workspace_id,status,next_due_date);
CREATE TABLE public.rental_loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.rental_workspaces(id) ON DELETE RESTRICT,
  loan_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  principal_amount numeric(14,2) NOT NULL CHECK (principal_amount >= 0),
  interest_amount numeric(14,2) NOT NULL CHECK (interest_amount >= 0),
  payment_date date NOT NULL DEFAULT current_date,
  payment_method text NOT NULL CHECK (payment_method IN ('cash','bank_transfer','upi','qr','cheque','other')),
  reference text,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (round(principal_amount+interest_amount,2)=amount),
  FOREIGN KEY (workspace_id,loan_id) REFERENCES public.rental_loans(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX rental_loan_payments_period_idx ON public.rental_loan_payments(workspace_id,payment_date,loan_id);
ALTER TABLE public.rental_other_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_loan_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY rental_other_income_select ON public.rental_other_income FOR SELECT TO authenticated USING (rental_private.is_member(workspace_id));
CREATE POLICY rental_other_income_insert ON public.rental_other_income FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant') AND recorded_by=(select auth.uid()));
CREATE POLICY rental_loans_select ON public.rental_loans FOR SELECT TO authenticated USING (rental_private.is_member(workspace_id));
CREATE POLICY rental_loans_insert ON public.rental_loans FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant') AND created_by=(select auth.uid()));
CREATE POLICY rental_loans_update ON public.rental_loans FOR UPDATE TO authenticated USING (rental_private.has_role(workspace_id,'accountant')) WITH CHECK (rental_private.has_role(workspace_id,'accountant'));
CREATE POLICY rental_loan_payments_select ON public.rental_loan_payments FOR SELECT TO authenticated USING (rental_private.is_member(workspace_id));
CREATE POLICY rental_loan_payments_insert ON public.rental_loan_payments FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant') AND recorded_by=(select auth.uid()));
GRANT SELECT,INSERT ON public.rental_other_income TO authenticated;
GRANT SELECT,INSERT ON public.rental_loans TO authenticated;
GRANT UPDATE (next_due_date,status) ON public.rental_loans TO authenticated;
GRANT SELECT,INSERT ON public.rental_loan_payments TO authenticated;
CREATE TRIGGER rental_loans_touch_updated_at BEFORE UPDATE ON public.rental_loans
FOR EACH ROW EXECUTE FUNCTION rental_private.touch_updated_at();
CREATE TRIGGER rental_other_income_audit AFTER INSERT ON public.rental_other_income
FOR EACH ROW EXECUTE FUNCTION rental_private.audit_row();
CREATE TRIGGER rental_loans_audit AFTER INSERT OR UPDATE ON public.rental_loans
FOR EACH ROW EXECUTE FUNCTION rental_private.audit_row();
CREATE TRIGGER rental_loan_payments_audit AFTER INSERT ON public.rental_loan_payments
FOR EACH ROW EXECUTE FUNCTION rental_private.audit_row();
