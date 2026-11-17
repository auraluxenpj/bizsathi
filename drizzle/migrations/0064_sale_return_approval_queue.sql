-- 0064: Add a branch-scoped, auditable sale-return request and approval workflow.
-- Requests reserve quantities but do not post stock, accounting or refunds until approval.
CREATE TABLE public.sale_return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  source_sale_id uuid NOT NULL,
  reserved_document_id uuid NOT NULL DEFAULT gen_random_uuid(),
  requested_lines jsonb NOT NULL CHECK (jsonb_typeof(requested_lines)='array' AND jsonb_array_length(requested_lines) BETWEEN 1 AND 100),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  decision_reason text,
  return_document_id uuid,
  UNIQUE (business_id,id),
  UNIQUE (business_id,reserved_document_id),
  FOREIGN KEY (business_id,branch_id) REFERENCES public.branches(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,source_sale_id) REFERENCES public.commerce_documents(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,return_document_id) REFERENCES public.commerce_documents(business_id,id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND decision_reason IS NULL AND return_document_id IS NULL)
      OR (status='approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND return_document_id IS NOT NULL)
      OR (status='rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND length(btrim(coalesce(decision_reason,''))) BETWEEN 3 AND 500 AND return_document_id IS NULL))
);
CREATE INDEX sale_return_requests_queue ON public.sale_return_requests(business_id,branch_id,status,created_at DESC);
CREATE INDEX sale_return_requests_source ON public.sale_return_requests(business_id,source_sale_id,status);
ALTER TABLE public.sale_return_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sale_return_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sale_return_requests TO authenticated;
GRANT ALL ON public.sale_return_requests TO service_role;
CREATE POLICY sale_return_requests_read ON public.sale_return_requests
FOR SELECT TO authenticated
USING (
  public.can_access_branch(business_id,branch_id)
  AND (
    requested_by=auth.uid()
    OR public.can_approve_inventory_count(business_id,branch_id)
  )
);

CREATE OR REPLACE FUNCTION public.request_sale_return(
  _business_id uuid, _source_sale_id uuid, _lines jsonb, _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
    public.has_business_job_title(_business_id,'sales_person')
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
END
$$;
REVOKE ALL ON FUNCTION public.request_sale_return(uuid,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_sale_return(uuid,uuid,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_sale_return_request(
  _request_id uuid, _decision text, _reason text DEFAULT NULL, _period_id uuid DEFAULT NULL, _date date DEFAULT CURRENT_DATE
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  actor uuid:=auth.uid();
  req public.sale_return_requests;
  source public.commerce_documents;
  item jsonb;
  source_line jsonb;
  qty numeric;
  source_qty numeric;
  confirmed_qty numeric;
  pending_qty numeric;
  posting_lines jsonb:='[]'::jsonb;
  posting jsonb;
  posted uuid;
  ref text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF _decision IS NULL OR _decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Choose approve or reject'; END IF;
  IF _decision='reject' AND length(btrim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Enter a rejection reason (3–500 characters)';
  END IF;
  SELECT * INTO req FROM public.sale_return_requests WHERE id=_request_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_branch(req.business_id,req.branch_id)
     OR NOT public.can_approve_inventory_count(req.business_id,req.branch_id) THEN
    RAISE EXCEPTION 'Branch return approval access denied' USING ERRCODE='42501';
  END IF;
  IF req.requested_by=actor THEN RAISE EXCEPTION 'You cannot approve your own return request' USING ERRCODE='42501'; END IF;
  IF req.status<>'pending' THEN
    IF req.status='approved' AND _decision='approve' THEN RETURN req.return_document_id; END IF;
    RAISE EXCEPTION 'This return request has already been reviewed';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(req.business_id::text,0));
  SELECT * INTO source FROM public.commerce_documents
  WHERE business_id=req.business_id AND id=req.source_sale_id AND kind='sale' AND status='confirmed'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original sale is no longer available'; END IF;

  IF _decision='reject' THEN
    UPDATE public.sale_return_requests SET status='rejected',reviewed_by=actor,reviewed_at=now(),decision_reason=btrim(_reason)
    WHERE id=req.id;
    PERFORM public.write_audit(req.business_id,'sale_return.reject','sale_return_requests',req.id::text,
      jsonb_build_object('status','pending'),jsonb_build_object('status','rejected','reason',btrim(_reason)));
    RETURN NULL;
  END IF;

  PERFORM public.commerce_open_period(req.business_id,_period_id,_date);
  FOR item IN SELECT value FROM jsonb_array_elements(req.requested_lines) LOOP
    SELECT l INTO source_line FROM jsonb_array_elements(source.lines) l WHERE l->>'variantId'=item->>'variantId';
    IF source_line IS NULL THEN RAISE EXCEPTION 'Requested item is no longer on the source sale'; END IF;
    qty:=(item->>'quantity')::numeric;
    source_qty:=(source_line->>'quantity')::numeric;
    SELECT coalesce(sum((l->>'quantity')::numeric),0) INTO confirmed_qty
    FROM public.commerce_documents d CROSS JOIN LATERAL jsonb_array_elements(d.lines) l
    WHERE d.business_id=req.business_id AND d.source_id=req.source_sale_id AND d.kind='sale_return'
      AND d.status='confirmed' AND l->>'variantId'=item->>'variantId';
    SELECT coalesce(sum((l->>'quantity')::numeric),0) INTO pending_qty
    FROM public.sale_return_requests r CROSS JOIN LATERAL jsonb_array_elements(r.requested_lines) l
    WHERE r.business_id=req.business_id AND r.source_sale_id=req.source_sale_id AND r.status='pending'
      AND r.id<>req.id AND l->>'variantId'=item->>'variantId';
    IF qty+confirmed_qty+pending_qty>source_qty THEN
      RAISE EXCEPTION 'Return quantity changed; review the remaining quantity before approval';
    END IF;
    posting_lines:=posting_lines||jsonb_build_array(jsonb_build_object(
      'variantId',item->>'variantId','quantity',qty,'price',(source_line->>'price')::numeric,
      'discount',round(coalesce((source_line->>'discount')::numeric,0)*qty/source_qty,2),
      'taxRate',coalesce((source_line->>'taxRate')::numeric,0)
    ));
  END LOOP;
  ref:='SRN-'||upper(substr(replace(req.id::text,'-',''),1,12));
  posting:=jsonb_build_object('id',req.return_document_id,'businessId',req.business_id,'branchId',req.branch_id,
    'periodId',_period_id,'date',_date,'kind','sale_return','status','confirmed','sourceId',req.source_sale_id,
    'partyId',source.party_id,'reference',ref,'lines',posting_lines,'payments','[]'::jsonb,
    'returnRequestId',req.id,'returnRequesterId',req.requested_by);
  -- Mark approved inside this transaction before inserting the immutable return document.
  -- The deferred FK and posting guard ensure only this approval RPC can post the reserved document.
  UPDATE public.sale_return_requests SET status='approved',reviewed_by=actor,reviewed_at=now(),
    return_document_id=req.reserved_document_id WHERE id=req.id;
  posted:=public.post_commerce_document(posting);
  PERFORM public.write_audit(req.business_id,'sale_return.approve','sale_return_requests',req.id::text,
    jsonb_build_object('status','pending'),jsonb_build_object('status','approved','return_document_id',posted));
  RETURN posted;
END
$$;
REVOKE ALL ON FUNCTION public.review_sale_return_request(uuid,text,text,uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_sale_return_request(uuid,text,text,uuid,date) TO authenticated;

-- Every posted sale return must consume a pending request approved by a different authorized manager.
CREATE OR REPLACE FUNCTION public.guard_sale_return_request_posting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NEW.kind='sale_return' AND NOT EXISTS (
    SELECT 1 FROM public.sale_return_requests r
    WHERE r.business_id=NEW.business_id AND r.branch_id=NEW.branch_id
      AND r.source_sale_id=NEW.source_id AND r.reserved_document_id=NEW.id
      AND r.status='approved' AND r.reviewed_by=auth.uid()
      AND r.return_document_id=NEW.id
  ) THEN
    RAISE EXCEPTION 'A manager-approved sale return request is required before posting'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.guard_sale_return_request_posting() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sale_return_request_posting_guard
BEFORE INSERT ON public.commerce_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_sale_return_request_posting();

-- Branch Managers can post refunds only for approved sale returns in branches they can access.
DO $patch_refund$
DECLARE body text;
BEGIN
  SELECT pg_get_functiondef('public.post_commerce_payment(jsonb)'::regprocedure) INTO body;
  IF position('IF d.kind IN (''sale_return'',''purchase_return'') AND NOT public.has_business_role(b,''admin'') THEN' IN body)=0 THEN
    RAISE EXCEPTION 'Could not locate refund authorization in post_commerce_payment';
  END IF;
  IF position('IF NOT public.has_business_role(b,''accountant'') AND NOT (public.has_business_role(b,''staff'') AND d.kind=''sale'' AND d.actor_id=auth.uid()) THEN' IN body)=0 THEN
    RAISE EXCEPTION 'Could not locate payment role gate in post_commerce_payment';
  END IF;
  body:=replace(body,
    'IF NOT public.has_business_role(b,''accountant'') AND NOT (public.has_business_role(b,''staff'') AND d.kind=''sale'' AND d.actor_id=auth.uid()) THEN',
    'IF NOT public.has_business_role(b,''accountant'') AND NOT (public.has_business_role(b,''staff'') AND d.kind=''sale'' AND d.actor_id=auth.uid()) AND NOT (d.kind=''sale_return'' AND public.can_approve_inventory_count(b,d.branch_id)) THEN');
  IF position('IF session IS NULL OR NOT EXISTS(SELECT 1 FROM public.cash_counter_events WHERE session_id=session AND business_id=b AND branch_id=d.branch_id AND kind=''open'' AND actor_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.cash_counter_events WHERE session_id=session AND kind=''close'') THEN' IN body)=0 THEN
    RAISE EXCEPTION 'Could not locate cash session authorization in post_commerce_payment';
  END IF;
  body:=replace(body,
    'IF session IS NULL OR NOT EXISTS(SELECT 1 FROM public.cash_counter_events WHERE session_id=session AND business_id=b AND branch_id=d.branch_id AND kind=''open'' AND actor_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.cash_counter_events WHERE session_id=session AND kind=''close'') THEN',
    'IF session IS NULL OR NOT EXISTS(SELECT 1 FROM public.cash_counter_events opening WHERE opening.session_id=session AND opening.business_id=b AND opening.branch_id=d.branch_id AND opening.kind=''open'' AND (opening.actor_id=auth.uid() OR (d.kind=''sale_return'' AND public.can_approve_inventory_count(b,d.branch_id) AND EXISTS(SELECT 1 FROM public.sale_return_requests rr WHERE rr.business_id=b AND rr.return_document_id=d.id AND rr.requested_by=opening.actor_id)))) OR EXISTS(SELECT 1 FROM public.cash_counter_events WHERE session_id=session AND kind=''close'') THEN');
  body:=replace(body,
    'IF d.kind IN (''sale_return'',''purchase_return'') AND NOT public.has_business_role(b,''admin'') THEN',
    'IF (d.kind=''purchase_return'' AND NOT public.has_business_role(b,''admin'')) OR (d.kind=''sale_return'' AND NOT public.can_approve_inventory_count(b,d.branch_id)) THEN');
  EXECUTE body;
END
$patch_refund$;

-- Allow branch-scoped managers to post approved sale returns, while purchase returns remain admin-only.
DO $patch_document$
DECLARE body text;
BEGIN
  SELECT pg_get_functiondef('public.post_commerce_document(jsonb)'::regprocedure) INTO body;
  IF position('reqrole:=CASE WHEN k IN (''sale_return'',''purchase_return'') THEN ''admin''' IN body)=0 THEN
    RAISE EXCEPTION 'Could not locate return role authorization in post_commerce_document';
  END IF;
  body:=replace(body,
    'reqrole:=CASE WHEN k IN (''sale_return'',''purchase_return'') THEN ''admin'' WHEN k=''sale'' THEN ''staff'' ELSE ''accountant'' END;',
    'reqrole:=CASE WHEN k=''sale_return'' THEN ''branch_manager'' WHEN k=''purchase_return'' THEN ''admin'' WHEN k=''sale'' THEN ''staff'' ELSE ''accountant'' END;');
  EXECUTE body;
END
$patch_document$;
