ALTER TABLE public.commerce_journal_entries DROP CONSTRAINT commerce_journal_entries_account_code_check;
ALTER TABLE public.commerce_journal_entries ADD CONSTRAINT commerce_journal_entries_account_code_check CHECK (account_code = ANY (ARRAY['cash','bank','wallet','receivable','payable','sales','purchases','vat_output','vat_input','counter_clearing','expense_rent','expense_utilities','expense_operating','expense_salaries','expense_transport','expense_marketing','expense_supplies','expense_repairs','expense_professional']));

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['guard_voucher_journal','post_accounting_voucher'] LOOP
    EXECUTE replace(
      (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=f),
      '''expense_rent'',''expense_utilities'',''expense_operating'')',
      '''expense_rent'',''expense_utilities'',''expense_operating'',''expense_salaries'',''expense_transport'',''expense_marketing'',''expense_supplies'',''expense_repairs'',''expense_professional'')');
  END LOOP;
END $$;

CREATE TABLE public.expense_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  file_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','application/pdf')),
  ai_extraction jsonb,
  ai_error text,
  ai_model text,
  status text NOT NULL DEFAULT 'needs_review' CHECK (status IN ('needs_review','posted','rejected')),
  reviewed jsonb,
  voucher_id uuid REFERENCES public.accounting_vouchers(id) ON DELETE RESTRICT,
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 500),
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (file_path LIKE business_id::text || '/%'),
  CHECK ((status='posted') = (voucher_id IS NOT NULL))
);
CREATE INDEX expense_receipts_business_created_idx ON public.expense_receipts(business_id, created_at DESC);
REVOKE ALL ON public.expense_receipts FROM anon, authenticated;
GRANT SELECT, INSERT ON public.expense_receipts TO authenticated;
GRANT ALL ON public.expense_receipts TO service_role;
ALTER TABLE public.expense_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accountants read receipts" ON public.expense_receipts FOR SELECT TO authenticated USING (public.has_business_role(business_id,'accountant'));
CREATE POLICY "Accountants add receipts" ON public.expense_receipts FOR INSERT TO authenticated WITH CHECK (public.has_business_role(business_id,'accountant') AND uploaded_by = auth.uid() AND status='needs_review' AND voucher_id IS NULL AND reviewed IS NULL AND reviewed_by IS NULL);
CREATE TRIGGER expense_receipts_audit AFTER INSERT OR UPDATE ON public.expense_receipts FOR EACH ROW EXECUTE FUNCTION public.audit_row();

CREATE OR REPLACE FUNCTION public.confirm_expense_receipt(_receipt_id uuid, _request jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.expense_receipts; v uuid;
BEGIN
  SELECT * INTO r FROM public.expense_receipts WHERE id=_receipt_id FOR UPDATE;
  IF r.id IS NULL OR NOT public.has_business_role(r.business_id,'accountant') THEN RAISE EXCEPTION 'Receipt unavailable'; END IF;
  IF (_request->>'businessId')::uuid IS DISTINCT FROM r.business_id OR _request->>'kind' <> 'expense' THEN RAISE EXCEPTION 'Receipt request mismatch'; END IF;
  IF r.status='posted' THEN
    SELECT id INTO v FROM public.accounting_vouchers WHERE business_id=r.business_id AND request_id=(_request->>'id')::uuid;
    IF v IS NOT NULL AND v=r.voucher_id THEN RETURN v; END IF;
    RAISE EXCEPTION 'Receipt already posted';
  END IF;
  IF r.status<>'needs_review' THEN RAISE EXCEPTION 'Receipt is not awaiting review'; END IF;
  v := public.post_accounting_voucher(_request);
  UPDATE public.expense_receipts SET status='posted', voucher_id=v, reviewed=_request, reviewed_by=auth.uid(), reviewed_at=now() WHERE id=r.id;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.reject_expense_receipt(_receipt_id uuid, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.expense_receipts;
BEGIN
  SELECT * INTO r FROM public.expense_receipts WHERE id=_receipt_id FOR UPDATE;
  IF r.id IS NULL OR NOT public.has_business_role(r.business_id,'accountant') THEN RAISE EXCEPTION 'Receipt unavailable'; END IF;
  IF r.status<>'needs_review' THEN RAISE EXCEPTION 'Receipt is not awaiting review'; END IF;
  IF _note IS NULL OR char_length(btrim(_note)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Reason required'; END IF;
  UPDATE public.expense_receipts SET status='rejected', review_note=btrim(_note), reviewed_by=auth.uid(), reviewed_at=now() WHERE id=r.id;
END $$;
REVOKE ALL ON FUNCTION public.confirm_expense_receipt(uuid,jsonb), public.reject_expense_receipt(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_expense_receipt(uuid,jsonb), public.reject_expense_receipt(uuid,text) TO authenticated, service_role;

CREATE POLICY "Accountants upload receipt files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='expense-receipts' AND public.has_business_role(((storage.foldername(name))[1])::uuid,'accountant'));
CREATE POLICY "Accountants read receipt files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='expense-receipts' AND public.has_business_role(((storage.foldername(name))[1])::uuid,'accountant'));