CREATE TABLE public.website_stock_sync (business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE RESTRICT, connection text NOT NULL DEFAULT 'auraluxe' UNIQUE CHECK(connection='auraluxe'), branch_id uuid NOT NULL, lease_id uuid, lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(business_id,branch_id) REFERENCES public.branches(business_id,id) ON DELETE RESTRICT);
REVOKE ALL ON public.website_stock_sync FROM PUBLIC,anon,authenticated; GRANT SELECT ON public.website_stock_sync TO authenticated; GRANT ALL ON public.website_stock_sync TO service_role;
ALTER TABLE public.website_stock_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY website_sync_read ON public.website_stock_sync FOR SELECT TO authenticated USING(public.has_business_role(business_id,'admin') AND public.can_access_branch(business_id,branch_id));
CREATE TABLE public.website_stock_acknowledgements (id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT, branch_id uuid NOT NULL, variant_id uuid NOT NULL, sku text NOT NULL, delta integer NOT NULL CHECK(delta<>0 AND abs(delta)<=1000000), operation_id uuid NOT NULL UNIQUE, actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(business_id,branch_id) REFERENCES public.branches(business_id,id) ON DELETE RESTRICT, FOREIGN KEY(business_id,variant_id) REFERENCES public.product_variants(business_id,id) ON DELETE RESTRICT, FOREIGN KEY(business_id,operation_id) REFERENCES public.stock_operations(business_id,id) ON DELETE RESTRICT);
REVOKE ALL ON public.website_stock_acknowledgements FROM PUBLIC,anon,authenticated; GRANT SELECT ON public.website_stock_acknowledgements TO authenticated; GRANT ALL ON public.website_stock_acknowledgements TO service_role;
ALTER TABLE public.website_stock_acknowledgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY website_ack_read ON public.website_stock_acknowledgements FOR SELECT TO authenticated USING(public.has_business_role(business_id,'admin') AND public.can_access_branch(business_id,branch_id));
CREATE TRIGGER website_ack_immutable BEFORE UPDATE OR DELETE ON public.website_stock_acknowledgements FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER website_ack_audit AFTER INSERT ON public.website_stock_acknowledgements FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER website_binding_audit AFTER INSERT ON public.website_stock_sync FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE FUNCTION public.begin_website_stock_sync(_business_id uuid,_branch_id uuid,_lease_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.website_stock_sync;
BEGIN
 IF _business_id<>'985f4fd7-edcd-41a9-beec-8148fcb29818'::uuid OR auth.uid() IS NULL OR NOT public.has_business_role(_business_id,'admin') OR NOT public.can_access_branch(_business_id,_branch_id) THEN RAISE EXCEPTION 'Auraluxe administrator access required'; END IF;
 IF _lease_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.branches WHERE business_id=_business_id AND id=_branch_id AND is_active) THEN RAISE EXCEPTION 'Active fulfilment branch required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,0));
 SELECT * INTO r FROM public.website_stock_sync WHERE business_id=_business_id FOR UPDATE;
 IF FOUND THEN
  IF r.branch_id<>_branch_id THEN RAISE EXCEPTION 'Website fulfilment branch is already bound'; END IF;
  IF r.lease_until>now() THEN RAISE EXCEPTION 'Website sync already in progress'; END IF;
  UPDATE public.website_stock_sync SET lease_id=_lease_id,lease_until=now()+interval '5 minutes' WHERE business_id=_business_id;
 ELSE INSERT INTO public.website_stock_sync(business_id,branch_id,lease_id,lease_until) VALUES(_business_id,_branch_id,_lease_id,now()+interval '5 minutes'); END IF;
END $$;
CREATE FUNCTION public.end_website_stock_sync(_business_id uuid,_lease_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_business_role(_business_id,'admin') THEN RAISE EXCEPTION 'Administrator required'; END IF;
 UPDATE public.website_stock_sync SET lease_id=NULL,lease_until=NULL WHERE business_id=_business_id AND lease_id=_lease_id;
END $$;
CREATE FUNCTION public.read_website_stock_snapshot(_business_id uuid,_branch_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF _business_id<>'985f4fd7-edcd-41a9-beec-8148fcb29818'::uuid OR auth.uid() IS NULL OR NOT public.has_business_role(_business_id,'admin') OR NOT public.can_access_branch(_business_id,_branch_id) THEN RAISE EXCEPTION 'Auraluxe administrator required'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'stock',public.commerce_stock_balance(_business_id,_branch_id,v.id)::text)) FROM public.product_variants v JOIN public.products p ON p.business_id=v.business_id AND p.id=v.product_id WHERE v.business_id=_business_id AND v.is_active AND p.is_active),'[]'::jsonb);
END $$;
CREATE FUNCTION public.record_website_stock_ack(_business_id uuid,_branch_id uuid,_lease_id uuid,_ack_id uuid,_sku text,_delta integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.website_stock_acknowledgements; variant uuid; op uuid; n integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_business_role(_business_id,'admin') OR NOT public.can_access_branch(_business_id,_branch_id) THEN RAISE EXCEPTION 'Administrator required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.website_stock_sync WHERE business_id=_business_id AND branch_id=_branch_id AND lease_id=_lease_id AND lease_until>now()) THEN RAISE EXCEPTION 'Sync lease expired'; END IF;
 IF _ack_id IS NULL OR _delta IS NULL OR _delta=0 OR abs(_delta::bigint)>1000000 THEN RAISE EXCEPTION 'Invalid acknowledgement'; END IF;
 SELECT * INTO old FROM public.website_stock_acknowledgements WHERE id=_ack_id;
 IF FOUND THEN
  IF old.business_id=_business_id AND old.branch_id=_branch_id AND old.sku=lower(btrim(_sku)) AND old.delta=_delta THEN RETURN false; END IF;
  RAISE EXCEPTION 'Acknowledgement payload changed';
 END IF;
 SELECT count(*),(array_agg(v.id))[1] INTO n,variant FROM public.product_variants v JOIN public.products p ON p.business_id=v.business_id AND p.id=v.product_id WHERE v.business_id=_business_id AND lower(btrim(v.sku))=lower(btrim(_sku)) AND v.is_active AND p.is_active;
 IF n<>1 THEN RAISE EXCEPTION 'Unique active SKU required'; END IF;
 op:=gen_random_uuid();
 PERFORM public.post_stock_operation(_business_id,op,variant,_branch_id,NULL,'adjustment',_delta,'Website stock acknowledgement '||_ack_id::text,CASE WHEN _delta<0 THEN 'Website sale / stock decrease' ELSE 'Website return / stock increase' END);
 INSERT INTO public.website_stock_acknowledgements(id,business_id,branch_id,variant_id,sku,delta,operation_id,actor_id) VALUES(_ack_id,_business_id,_branch_id,variant,lower(btrim(_sku)),_delta,op,auth.uid());
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.begin_website_stock_sync(uuid,uuid,uuid),public.end_website_stock_sync(uuid,uuid),public.read_website_stock_snapshot(uuid,uuid),public.record_website_stock_ack(uuid,uuid,uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_website_stock_sync(uuid,uuid,uuid),public.end_website_stock_sync(uuid,uuid),public.read_website_stock_snapshot(uuid,uuid),public.record_website_stock_ack(uuid,uuid,uuid,uuid,text,integer) TO authenticated;
COMMENT ON TABLE public.website_stock_acknowledgements IS 'Append-only website quantity evidence, not a financial sale, tax posting or loyalty award. Website acknowledgement IDs deduplicate across administrator retries.';