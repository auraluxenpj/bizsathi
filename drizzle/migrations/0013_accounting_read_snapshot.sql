CREATE OR REPLACE FUNCTION public.read_accounting_snapshot(_business_id uuid, _branch_id uuid DEFAULT NULL, _through date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_business_member(_business_id) THEN RAISE EXCEPTION 'Business access required' USING ERRCODE='42501'; END IF;
 IF _branch_id IS NOT NULL AND NOT public.can_access_branch(_business_id,_branch_id) THEN RAISE EXCEPTION 'Branch access required' USING ERRCODE='42501'; END IF;
 IF _through IS NULL THEN RAISE EXCEPTION 'End date required'; END IF;
 RETURN jsonb_build_object(
 'journals',COALESCE((SELECT jsonb_agg(to_jsonb(j)||jsonb_build_object('debit',j.debit::text,'credit',j.credit::text) ORDER BY j.entry_date,j.created_at,j.id) FROM public.commerce_journal_entries j WHERE j.business_id=_business_id AND (_branch_id IS NULL OR j.branch_id=_branch_id) AND j.entry_date<=_through),'[]'::jsonb),
 'documents',COALESCE((SELECT jsonb_agg(to_jsonb(d)||jsonb_build_object('subtotal',d.subtotal::text,'tax',d.tax::text,'total',d.total::text)-'request'-'lines' ORDER BY d.document_date,d.id) FROM public.commerce_documents d WHERE d.business_id=_business_id AND (_branch_id IS NULL OR d.branch_id=_branch_id) AND d.document_date<=_through AND d.status='confirmed'),'[]'::jsonb),
 'payments',COALESCE((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('amount',p.amount::text)-'request' ORDER BY p.payment_date,p.id) FROM public.commerce_payments p WHERE p.business_id=_business_id AND (_branch_id IS NULL OR p.branch_id=_branch_id) AND p.payment_date<=_through),'[]'::jsonb),
 'counters',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'reference',c.reference)) FROM public.cash_counter_events c WHERE c.business_id=_business_id AND (_branch_id IS NULL OR c.branch_id=_branch_id) AND c.event_date<=_through),'[]'::jsonb),
 'parties',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'kind',p.kind)) FROM public.parties p WHERE p.business_id=_business_id),'[]'::jsonb),
 'branches',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name)) FROM public.branches b WHERE b.business_id=_business_id),'[]'::jsonb),
 'periods',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'start_date',p.start_date,'end_date',p.end_date)) FROM public.financial_periods p WHERE p.business_id=_business_id),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.read_accounting_snapshot(uuid,uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_accounting_snapshot(uuid,uuid,date) TO authenticated,service_role;
COMMENT ON FUNCTION public.read_accounting_snapshot(uuid,uuid,date) IS 'Read-only single-statement accounting evidence snapshot. Invoker RLS and explicit tenant/branch verification; no posting or balance changes.';