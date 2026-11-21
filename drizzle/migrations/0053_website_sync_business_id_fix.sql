-- Correct the legacy workspace identifier in the website stock-sync RPCs.
-- The canonical Auraluxe workspace is guarded by is_auraluxe_workspace().
CREATE OR REPLACE FUNCTION public.begin_website_stock_sync(_business_id uuid,_branch_id uuid,_lease_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.website_stock_sync;
BEGIN
 IF NOT public.is_auraluxe_workspace(_business_id) OR auth.uid() IS NULL OR NOT public.has_business_role(_business_id,'admin') OR NOT public.can_access_branch(_business_id,_branch_id) THEN RAISE EXCEPTION 'Auraluxe administrator access required'; END IF;
 IF _lease_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.branches WHERE business_id=_business_id AND id=_branch_id AND is_active) THEN RAISE EXCEPTION 'Active fulfilment branch required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,0));
 SELECT * INTO r FROM public.website_stock_sync WHERE business_id=_business_id FOR UPDATE;
 IF FOUND THEN
  IF r.branch_id<>_branch_id THEN RAISE EXCEPTION 'Website fulfilment branch is already bound'; END IF;
  IF r.lease_until>now() THEN RAISE EXCEPTION 'Website sync already in progress'; END IF;
  UPDATE public.website_stock_sync SET lease_id=_lease_id,lease_until=now()+interval '5 minutes' WHERE business_id=_business_id;
 ELSE
  INSERT INTO public.website_stock_sync(business_id,branch_id,lease_id,lease_until) VALUES(_business_id,_branch_id,_lease_id,now()+interval '5 minutes');
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.read_website_stock_snapshot(_business_id uuid,_branch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_auraluxe_workspace(_business_id) OR auth.uid() IS NULL OR NOT public.has_business_role(_business_id,'admin') OR NOT public.can_access_branch(_business_id,_branch_id) THEN RAISE EXCEPTION 'Auraluxe administrator required'; END IF;
 RETURN coalesce((
  SELECT jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'stock',public.commerce_stock_balance(_business_id,_branch_id,v.id)::text))
  FROM public.product_variants v
  JOIN public.products p ON p.business_id=v.business_id AND p.id=v.product_id
  WHERE v.business_id=_business_id AND v.is_active AND p.is_active
 ),'[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.begin_website_stock_sync(uuid,uuid,uuid),public.read_website_stock_snapshot(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_website_stock_sync(uuid,uuid,uuid),public.read_website_stock_snapshot(uuid,uuid) TO authenticated;
