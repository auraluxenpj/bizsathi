-- 0087: remove the remaining sale-return authorization dependency on HR position.
-- Sale-return requests use assigned cashier/Branch Manager roles, not HR titles.
CREATE OR REPLACE FUNCTION public.request_sale_return(
  _business_id uuid,_source_sale_id uuid,_lines jsonb,_reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $request_sale_return$
DECLARE
  actor uuid:=auth.uid();
  source public.commerce_documents;
  request_id uuid:=gen_random_uuid();
  item jsonb;
  source_line jsonb;
  variant uuid;
  qty numeric;
  source_qty numeric;
  confirmed_qty numeric;
  pending_qty numeric;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(_lines)<>'array' OR jsonb_array_length(_lines) NOT BETWEEN 1 AND 100
     OR length(btrim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Select return items and enter a reason (3–500 characters)';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,0));
  SELECT * INTO source FROM public.commerce_documents
  WHERE business_id=_business_id AND id=_source_sale_id AND kind='sale' AND status='confirmed'
  FOR SHARE;
  IF NOT FOUND OR NOT public.can_access_branch(_business_id,source.branch_id)
     OR NOT public.has_permission(_business_id,'sales.view') THEN
    RAISE EXCEPTION 'Original sale access denied' USING ERRCODE='42501';
  END IF;
  IF NOT (
    public.has_business_access_role(_business_id,'position_sales_person')
    OR public.has_business_access_role(_business_id,'legacy_staff')
    OR public.can_approve_inventory_count(_business_id,source.branch_id)
  ) OR NOT public.has_permission(_business_id,'sales.create') THEN
    RAISE EXCEPTION 'Sales permission required' USING ERRCODE='42501';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(_lines) LOOP
    IF item->>'variantId' IS NULL OR item->>'quantity' IS NULL
       OR (item->>'variantId') !~* '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'Invalid return item'; END IF;
    variant:=(item->>'variantId')::uuid;
    qty:=(item->>'quantity')::numeric;
    IF qty IS NULL OR qty<=0 OR qty<>round(qty,3) OR qty::text IN ('NaN','Infinity','-Infinity')
       OR (SELECT count(*) FROM jsonb_array_elements(_lines) x WHERE x->>'variantId'=variant::text)<>1 THEN
      RAISE EXCEPTION 'Invalid or duplicate return quantity';
    END IF;
    SELECT l INTO source_line FROM jsonb_array_elements(source.lines) l WHERE l->>'variantId'=variant::text;
    IF source_line IS NULL THEN RAISE EXCEPTION 'Return item is not on the original sale'; END IF;
    source_qty:=(source_line->>'quantity')::numeric;
    SELECT coalesce(sum((l->>'quantity')::numeric),0) INTO confirmed_qty
    FROM public.commerce_documents d CROSS JOIN LATERAL jsonb_array_elements(d.lines) l
    WHERE d.business_id=_business_id AND d.source_id=_source_sale_id AND d.kind='sale_return'
      AND d.status='confirmed' AND l->>'variantId'=variant::text;
    SELECT coalesce(sum((l->>'quantity')::numeric),0) INTO pending_qty
    FROM public.sale_return_requests r CROSS JOIN LATERAL jsonb_array_elements(r.requested_lines) l
    WHERE r.business_id=_business_id AND r.source_sale_id=_source_sale_id AND r.status='pending'
      AND l->>'variantId'=variant::text;
    IF qty+confirmed_qty+pending_qty>source_qty THEN
      RAISE EXCEPTION 'Requested quantity exceeds the remaining returnable quantity';
    END IF;
  END LOOP;

  INSERT INTO public.sale_return_requests(id,business_id,branch_id,source_sale_id,requested_lines,reason,requested_by)
  VALUES(request_id,_business_id,source.branch_id,_source_sale_id,_lines,btrim(_reason),actor);
  PERFORM public.write_audit(_business_id,'sale_return.request','sale_return_requests',request_id::text,NULL,
    jsonb_build_object('branch_id',source.branch_id,'source_sale_id',_source_sale_id,'line_count',jsonb_array_length(_lines)));
  RETURN request_id;
END;
$request_sale_return$;
REVOKE ALL ON FUNCTION public.request_sale_return(uuid,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_sale_return(uuid,uuid,jsonb,text) TO authenticated,service_role;
