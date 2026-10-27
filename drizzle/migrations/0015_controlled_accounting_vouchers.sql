ALTER TABLE public.commerce_journal_entries DROP CONSTRAINT commerce_journal_entries_account_code_check;
ALTER TABLE public.commerce_journal_entries ADD CONSTRAINT commerce_journal_entries_account_code_check CHECK(account_code IN ('cash','bank','wallet','receivable','payable','sales','purchases','vat_output','vat_input','counter_clearing','expense_rent','expense_utilities','expense_operating'));
CREATE TABLE public.accounting_vouchers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,branch_id uuid NOT NULL,period_id uuid NOT NULL,request_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('journal','expense','reversal')),voucher_date date NOT NULL,reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 1 AND 200),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),reverses_id uuid,actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,request jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(business_id,id),UNIQUE(business_id,request_id),UNIQUE(business_id,reference),UNIQUE(reverses_id),CHECK((kind='reversal')=(reverses_id IS NOT NULL)),FOREIGN KEY(business_id,branch_id) REFERENCES public.branches(business_id,id) ON DELETE RESTRICT,FOREIGN KEY(business_id,period_id) REFERENCES public.financial_periods(business_id,id) ON DELETE RESTRICT,FOREIGN KEY(business_id,reverses_id) REFERENCES public.accounting_vouchers(business_id,id) ON DELETE RESTRICT);
REVOKE ALL ON public.accounting_vouchers FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.accounting_vouchers TO authenticated;GRANT ALL ON public.accounting_vouchers TO service_role;
ALTER TABLE public.accounting_vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounting_voucher_read ON public.accounting_vouchers FOR SELECT TO authenticated USING(public.can_access_branch(business_id,branch_id));
CREATE INDEX accounting_voucher_dates ON public.accounting_vouchers(business_id,branch_id,voucher_date);
CREATE TRIGGER accounting_voucher_immutable BEFORE UPDATE OR DELETE ON public.accounting_vouchers FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER accounting_voucher_audit AFTER INSERT ON public.accounting_vouchers FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE FUNCTION public.guard_voucher_journal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v public.accounting_vouchers;BEGIN
 SELECT * INTO v FROM public.accounting_vouchers WHERE id=NEW.source_id;
 IF NEW.source_type='voucher' THEN
 IF v.id IS NULL OR v.business_id<>NEW.business_id OR v.branch_id<>NEW.branch_id OR v.period_id<>NEW.period_id OR v.voucher_date<>NEW.entry_date OR v.actor_id<>NEW.actor_id OR NEW.account_code NOT IN ('bank','wallet','expense_rent','expense_utilities','expense_operating') THEN RAISE EXCEPTION 'Invalid voucher journal source';END IF;
 ELSIF v.id IS NOT NULL THEN RAISE EXCEPTION 'Reserved voucher source identifier';END IF;
 IF NEW.debit::text IN ('NaN','Infinity','-Infinity') OR NEW.credit::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Finite amounts required';END IF;
 RETURN NEW;END $$;
REVOKE ALL ON FUNCTION public.guard_voucher_journal() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER voucher_journal_source BEFORE INSERT ON public.commerce_journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_voucher_journal();
CREATE FUNCTION public.post_accounting_voucher(_request jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid:=(_request->>'businessId')::uuid;br uuid:=(_request->>'branchId')::uuid;per uuid:=(_request->>'periodId')::uuid;reqid uuid:=(_request->>'id')::uuid;dt date:=(_request->>'date')::date;k text:=_request->>'kind';v public.accounting_vouchers;orig public.accounting_vouchers;vid uuid;r jsonb;ac text;d numeric;c numeric;td numeric:=0;tc numeric:=0;
BEGIN
 IF auth.uid() IS NULL OR b IS NULL OR br IS NULL OR per IS NULL OR reqid IS NULL OR dt IS NULL OR k IS NULL OR k NOT IN ('journal','expense','reversal') OR NOT public.has_business_role(b,CASE WHEN k='reversal' THEN 'admin' ELSE 'accountant' END) OR NOT public.can_access_branch(b,br) THEN RAISE EXCEPTION 'Voucher access denied';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(b::text,0));
 SELECT * INTO v FROM public.accounting_vouchers WHERE business_id=b AND request_id=reqid;
 IF FOUND THEN IF v.actor_id=auth.uid() AND v.request=_request THEN RETURN v.id;END IF;RAISE EXCEPTION 'Request identifier conflict';END IF;
 IF COALESCE(length(btrim(_request->>'reference')),0) NOT BETWEEN 1 AND 200 OR COALESCE(length(btrim(_request->>'reason')),0) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Reference and reason required';END IF;
 PERFORM public.commerce_open_period(b,per,dt);
 IF k='reversal' THEN
 SELECT * INTO orig FROM public.accounting_vouchers WHERE business_id=b AND id=(_request->>'reversesId')::uuid AND branch_id=br FOR UPDATE;
 IF NOT FOUND OR orig.kind='reversal' OR dt<orig.voucher_date OR EXISTS(SELECT 1 FROM public.accounting_vouchers WHERE reverses_id=orig.id) THEN RAISE EXCEPTION 'Voucher cannot be reversed';END IF;
 ELSE
 IF _request ? 'reversesId' OR jsonb_typeof(_request->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(_request->'lines') NOT BETWEEN 2 AND 50 THEN RAISE EXCEPTION 'Use 2 to 50 lines';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(_request->'lines') LOOP
 ac:=r->>'account';d:=(r->>'debit')::numeric;c:=(r->>'credit')::numeric;
 IF ac IS NULL OR ac NOT IN ('bank','wallet','expense_rent','expense_utilities','expense_operating') OR d IS NULL OR c IS NULL OR d::text IN ('NaN','Infinity','-Infinity') OR c::text IN ('NaN','Infinity','-Infinity') OR d<0 OR c<0 OR d>=10000000000000000 OR c>=10000000000000000 OR d<>round(d,2) OR c<>round(c,2) OR NOT ((d>0 AND c=0) OR (c>0 AND d=0)) THEN RAISE EXCEPTION 'Invalid voucher line';END IF;
 IF k='expense' AND NOT ((ac LIKE 'expense_%' AND d>0) OR (ac IN ('bank','wallet') AND c>0)) THEN RAISE EXCEPTION 'Expense must debit expense and credit bank or wallet';END IF;
 td:=td+d;tc:=tc+c;
 END LOOP;
 IF td<=0 OR td<>tc THEN RAISE EXCEPTION 'Voucher does not balance';END IF;
 END IF;
 LOOP vid:=gen_random_uuid();EXIT WHEN NOT EXISTS(SELECT 1 FROM public.commerce_journal_entries WHERE source_id=vid) AND NOT EXISTS(SELECT 1 FROM public.accounting_vouchers WHERE id=vid);END LOOP;
 INSERT INTO public.accounting_vouchers(id,business_id,branch_id,period_id,request_id,kind,voucher_date,reference,reason,reverses_id,actor_id,request) VALUES(vid,b,br,per,reqid,k,dt,btrim(_request->>'reference'),btrim(_request->>'reason'),CASE WHEN k='reversal' THEN orig.id END,auth.uid(),_request);
 IF k='reversal' THEN
 INSERT INTO public.commerce_journal_entries(business_id,branch_id,period_id,source_id,source_type,entry_date,account_code,debit,credit,actor_id) SELECT b,br,per,vid,'voucher',dt,account_code,credit,debit,auth.uid() FROM public.commerce_journal_entries WHERE business_id=b AND source_id=orig.id AND source_type='voucher';
 IF NOT FOUND THEN RAISE EXCEPTION 'Original voucher lines missing';END IF;
 ELSE
 FOR r IN SELECT value FROM jsonb_array_elements(_request->'lines') LOOP PERFORM public.commerce_journal(b,br,per,vid,'voucher',dt,r->>'account',(r->>'debit')::numeric,(r->>'credit')::numeric);END LOOP;
 END IF;
 RETURN vid;
END $$;
REVOKE ALL ON FUNCTION public.post_accounting_voucher(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.post_accounting_voucher(jsonb) TO authenticated;
DO $snapshot$ DECLARE body text;BEGIN SELECT pg_get_functiondef('public.read_accounting_snapshot(uuid,uuid,date)'::regprocedure) INTO body;
body:=replace(body,'''journals'',COALESCE','''vouchers'',COALESCE((SELECT jsonb_agg(to_jsonb(v)-''request'' ORDER BY v.voucher_date,v.id) FROM public.accounting_vouchers v WHERE v.business_id=_business_id AND (_branch_id IS NULL OR v.branch_id=_branch_id) AND v.voucher_date<=_through),''[]''::jsonb),'||chr(10)||'''journals'',COALESCE');EXECUTE body;END $snapshot$;
COMMENT ON TABLE public.accounting_vouchers IS 'Append-only controlled bank/wallet and expense vouchers, with full voucher-only reversals. Not invoice/payment/counter corrections or opening balances.';