CREATE OR REPLACE FUNCTION public.read_business_report_snapshot(_business_id uuid, _branch_id uuid DEFAULT NULL, _through date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE accounting jsonb; zone text; curr text; movements jsonb; actors jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_business_member(_business_id) THEN RAISE EXCEPTION 'Business access required' USING ERRCODE='42501'; END IF;
 IF _branch_id IS NOT NULL AND NOT public.can_access_branch(_business_id,_branch_id) THEN RAISE EXCEPTION 'Branch access required' USING ERRCODE='42501'; END IF;
 IF _through IS NULL THEN RAISE EXCEPTION 'End date required'; END IF;
 SELECT timezone,currency INTO zone,curr FROM public.business_settings WHERE business_id=_business_id;
 IF zone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN RAISE EXCEPTION 'Valid business timezone required'; END IF;
 accounting:=public.read_accounting_snapshot(_business_id,_branch_id,_through);
 SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at,m.id),'[]'::jsonb) INTO movements FROM (
 SELECT id,business_id,branch_id,variant_id,quantity::text AS quantity,kind,reference,reason,actor_id,created_at,(created_at AT TIME ZONE zone)::date AS movement_date,operation_id::text AS source_id,'stock'::text AS source_type FROM public.stock_movements WHERE business_id=_business_id AND (_branch_id IS NULL OR branch_id=_branch_id) AND (created_at AT TIME ZONE zone)::date<=_through
 UNION ALL
 SELECT id,business_id,branch_id,variant_id,quantity::text,kind,reference,reason,actor_id,created_at,(created_at AT TIME ZONE zone)::date,document_id::text,'document'::text FROM public.commerce_stock_movements WHERE business_id=_business_id AND (_branch_id IS NULL OR branch_id=_branch_id) AND (created_at AT TIME ZONE zone)::date<=_through
 )m;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'name',COALESCE(NULLIF(p.full_name,''),a.id::text)) ORDER BY a.id),'[]'::jsonb) INTO actors FROM (
 SELECT DISTINCT (e->>'actor_id')::uuid AS id FROM jsonb_array_elements((accounting->'journals')||(accounting->'documents')||(accounting->'payments')||COALESCE(accounting->'vouchers','[]'::jsonb)||movements)e WHERE e->>'actor_id' IS NOT NULL
 )a LEFT JOIN public.profiles p ON p.id=a.id;
 RETURN accounting||jsonb_build_object('movements',movements,'users',actors,'timezone',zone,'currency',curr,'variants',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'business_id',v.business_id,'name',p.name||' · '||v.name,'sku',v.sku,'unit',v.unit,'reorder_level',v.reorder_level::text,'is_active',v.is_active AND p.is_active) ORDER BY v.sku) FROM public.product_variants v JOIN public.products p ON p.business_id=v.business_id AND p.id=v.product_id WHERE v.business_id=_business_id),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.read_business_report_snapshot(uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_business_report_snapshot(uuid,uuid,date) TO authenticated,service_role;
COMMENT ON FUNCTION public.read_business_report_snapshot(uuid,uuid,date) IS 'Read-only authorized accounting and combined quantity evidence, stock dates in business timezone, and actor selectors from visible evidence only. No costing or financial posting.';