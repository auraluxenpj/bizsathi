ALTER TABLE public.loyalty_point_events ADD COLUMN points_per_100 integer NOT NULL DEFAULT 1 CHECK (points_per_100 IN (1,10));
CREATE FUNCTION public.loyalty_earned_points(_total numeric, _rate integer DEFAULT 10) RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT (floor(greatest(0,_total)/100)*_rate)::bigint $$;
REVOKE ALL ON FUNCTION public.loyalty_earned_points(numeric,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.loyalty_earned_points(numeric,integer) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.post_document_loyalty() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE mobile_number text; member_id uuid; original public.commerce_documents; earned bigint; net_points bigint; existing_points bigint; returned numeric; earning_rate integer; BEGIN
 IF NEW.status<>'confirmed' OR NEW.kind NOT IN ('sale','sale_return') THEN RETURN NEW; END IF;
 IF NEW.actor_id IS DISTINCT FROM auth.uid() OR NOT public.has_business_role(NEW.business_id,CASE WHEN NEW.kind='sale' THEN 'staff' ELSE 'admin' END) OR NOT public.can_access_branch(NEW.business_id,NEW.branch_id) THEN RAISE EXCEPTION 'Loyalty posting access denied'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.business_id::text,0));
 IF NEW.kind='sale' THEN
 mobile_number:=public.normalize_member_mobile(NEW.request->>'mobile'); IF mobile_number IS NULL THEN RAISE EXCEPTION 'A valid customer mobile number is required for sales'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.business_settings WHERE business_id=NEW.business_id AND currency='NPR') THEN RAISE EXCEPTION 'Loyalty earning currently requires NPR'; END IF;
 INSERT INTO public.customer_memberships(business_id,mobile) VALUES(NEW.business_id,mobile_number) ON CONFLICT(business_id,mobile) DO NOTHING;
 SELECT id INTO member_id FROM public.customer_memberships WHERE business_id=NEW.business_id AND mobile=mobile_number;
 earned:=public.loyalty_earned_points(NEW.total,10);
 INSERT INTO public.loyalty_point_events(business_id,branch_id,membership_id,document_id,sale_id,points,actor_id,points_per_100) VALUES(NEW.business_id,NEW.branch_id,member_id,NEW.id,NEW.id,earned,NEW.actor_id,10);
 ELSE
 SELECT * INTO original FROM public.commerce_documents WHERE business_id=NEW.business_id AND id=NEW.source_id AND kind='sale' AND status='confirmed';
 SELECT membership_id,points,points_per_100 INTO member_id,earned,earning_rate FROM public.loyalty_point_events WHERE business_id=NEW.business_id AND document_id=NEW.source_id AND sale_id=NEW.source_id;
 IF member_id IS NULL THEN RETURN NEW; END IF;
 SELECT coalesce(sum(total),0) INTO returned FROM public.commerce_documents WHERE business_id=NEW.business_id AND source_id=NEW.source_id AND kind='sale_return' AND status='confirmed';
 SELECT coalesce(sum(points),0) INTO existing_points FROM public.loyalty_point_events WHERE business_id=NEW.business_id AND sale_id=NEW.source_id;
 net_points:=least(earned,greatest(0,public.loyalty_earned_points(original.total-returned,earning_rate)));
 INSERT INTO public.loyalty_point_events(business_id,branch_id,membership_id,document_id,sale_id,points,actor_id,points_per_100) VALUES(NEW.business_id,NEW.branch_id,member_id,NEW.id,NEW.source_id,net_points-existing_points,NEW.actor_id,earning_rate);
 END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.post_document_loyalty() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_customer_loyalty(_business_id uuid) RETURNS TABLE(mobile text,membership_number text,points text,purchase_count text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT m.mobile,m.membership_number,sum(e.points)::text,count(DISTINCT e.document_id) FILTER (WHERE e.document_id=e.sale_id)::text
 FROM public.customer_memberships m JOIN public.loyalty_point_events e ON e.business_id=m.business_id AND e.membership_id=m.id
 WHERE m.business_id=_business_id AND public.is_business_member(_business_id) AND public.has_permission(_business_id,'customers.view') GROUP BY m.id,m.mobile,m.membership_number
 $$;
REVOKE ALL ON FUNCTION public.read_customer_loyalty(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_customer_loyalty(uuid) TO authenticated,service_role;
COMMENT ON COLUMN public.loyalty_point_events.points_per_100 IS 'Original earning rate: legacy awards retain one point per NPR 100; new awards use ten. Returns use the source sale rate.';