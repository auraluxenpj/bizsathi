-- 0034: Checkout loyalty redemption. 100 points = NPR 1 (one point = NPR 0.01), whole points only.
-- Additive. Replaces only post_document_loyalty() (0032 logic kept as is, plus redemption) and read_customer_loyalty() (balance now includes redemptions).
-- The posting function post_commerce_document is NOT edited: the loyalty discount travels as an ordinary line discount, so tax, journals,
-- receivables and return pricing/refund limits already treat the discounted amounts as the settled amounts.
-- Roll forward only. Append-only evidence; never edit or delete rows.

CREATE TABLE public.loyalty_redemptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
 branch_id uuid NOT NULL,
 membership_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 document_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('spend','restore')),
 points bigint NOT NULL,
 discount numeric(18,2) NOT NULL CHECK(discount>0),
 actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(business_id,document_id),
 CHECK((kind='spend' AND points<0 AND document_id=sale_id AND discount=(-points)/100.0) OR (kind='restore' AND points>0 AND document_id<>sale_id AND discount=points/100.0)),
 FOREIGN KEY(business_id,branch_id) REFERENCES public.branches(business_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(business_id,membership_id) REFERENCES public.customer_memberships(business_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(business_id,document_id) REFERENCES public.commerce_documents(business_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(business_id,sale_id) REFERENCES public.commerce_documents(business_id,id) ON DELETE RESTRICT);
CREATE UNIQUE INDEX loyalty_one_spend_per_sale ON public.loyalty_redemptions(business_id,sale_id) WHERE kind='spend';
CREATE INDEX loyalty_redemption_member_lookup ON public.loyalty_redemptions(business_id,membership_id);
CREATE INDEX loyalty_redemption_sale_lookup ON public.loyalty_redemptions(business_id,sale_id);
REVOKE ALL ON public.loyalty_redemptions FROM PUBLIC,anon,authenticated; GRANT SELECT ON public.loyalty_redemptions TO authenticated; GRANT ALL ON public.loyalty_redemptions TO service_role;
ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY loyalty_redemptions_read ON public.loyalty_redemptions FOR SELECT TO authenticated USING(public.can_access_branch(business_id,branch_id));
CREATE TRIGGER loyalty_redemptions_immutable BEFORE UPDATE OR DELETE ON public.loyalty_redemptions FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER loyalty_redemptions_audit AFTER INSERT ON public.loyalty_redemptions FOR EACH ROW EXECUTE FUNCTION public.audit_row();

-- The authoritative balance: earned points plus redemption evidence (spends are negative, restorations positive). May be negative after a return.
CREATE FUNCTION public.loyalty_balance(_business uuid,_membership uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT sum(points) FROM public.loyalty_point_events WHERE business_id=_business AND membership_id=_membership),0)
      + coalesce((SELECT sum(points) FROM public.loyalty_redemptions WHERE business_id=_business AND membership_id=_membership),0) $$;
REVOKE ALL ON FUNCTION public.loyalty_balance(uuid,uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.loyalty_balance(uuid,uuid) TO service_role;

-- Defence in depth: whatever inserts a row, spending can never take the balance below zero and restoring can never exceed what was spent.
CREATE FUNCTION public.guard_loyalty_redemption() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE spent bigint; restored bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.business_id::text,0));
 IF NEW.kind='spend' THEN
  IF public.loyalty_balance(NEW.business_id,NEW.membership_id)+NEW.points<0 THEN RAISE EXCEPTION 'Loyalty points balance is lower than the points requested'; END IF;
 ELSE
  SELECT coalesce(-sum(points),0) INTO spent FROM public.loyalty_redemptions WHERE business_id=NEW.business_id AND sale_id=NEW.sale_id AND membership_id=NEW.membership_id AND kind='spend';
  SELECT coalesce(sum(points),0) INTO restored FROM public.loyalty_redemptions WHERE business_id=NEW.business_id AND sale_id=NEW.sale_id AND kind='restore';
  IF restored+NEW.points>spent THEN RAISE EXCEPTION 'Restored loyalty points exceed the points spent on this sale'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_loyalty_redemption() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER loyalty_redemption_guard BEFORE INSERT ON public.loyalty_redemptions FOR EACH ROW EXECUTE FUNCTION public.guard_loyalty_redemption();

-- Earning (0032 logic, unchanged) plus redemption on sales and proportional restoration on returns.
CREATE OR REPLACE FUNCTION public.post_document_loyalty() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE mobile_number text; member_id uuid; original public.commerce_documents; earned bigint; net_points bigint; existing_points bigint; returned numeric; earning_rate integer;
 redeem bigint:=0; labelled numeric; bad_format integer; over_line integer; spent bigint; restored_total bigint; restore_now bigint; BEGIN
 IF NEW.status<>'confirmed' OR NEW.kind NOT IN ('sale','sale_return') THEN RETURN NEW; END IF;
 IF NEW.actor_id IS DISTINCT FROM auth.uid() OR NOT public.has_business_role(NEW.business_id,CASE WHEN NEW.kind='sale' THEN 'staff' ELSE 'admin' END) OR NOT public.can_access_branch(NEW.business_id,NEW.branch_id) THEN RAISE EXCEPTION 'Loyalty posting access denied'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.business_id::text,0));
 IF NEW.kind='sale' THEN
 mobile_number:=public.normalize_member_mobile(NEW.request->>'mobile'); IF mobile_number IS NULL THEN RAISE EXCEPTION 'A valid customer mobile number is required for sales'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.business_settings WHERE business_id=NEW.business_id AND currency='NPR') THEN RAISE EXCEPTION 'Loyalty earning currently requires NPR'; END IF;
 INSERT INTO public.customer_memberships(business_id,mobile) VALUES(NEW.business_id,mobile_number) ON CONFLICT(business_id,mobile) DO NOTHING;
 SELECT id INTO member_id FROM public.customer_memberships WHERE business_id=NEW.business_id AND mobile=mobile_number;
 -- Redemption is checked and recorded BEFORE this sale's own points are earned, so a sale can never fund its own discount.
 IF coalesce(NEW.request->>'redeemPoints','0') !~ '^[0-9]{1,9}$' THEN RAISE EXCEPTION 'Invalid loyalty redemption'; END IF;
 redeem:=coalesce(NEW.request->>'redeemPoints','0')::bigint;
 IF jsonb_typeof(NEW.request->'lines')<>'array' OR jsonb_array_length(NEW.request->'lines')<>jsonb_array_length(NEW.lines) THEN RAISE EXCEPTION 'Invalid loyalty redemption'; END IF;
 SELECT count(*) FILTER (WHERE coalesce(rl->>'loyaltyDiscount','0') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$') INTO bad_format FROM jsonb_array_elements(NEW.request->'lines') rl;
 IF bad_format>0 THEN RAISE EXCEPTION 'Invalid loyalty redemption'; END IF;
 SELECT coalesce(sum(coalesce(rl->>'loyaltyDiscount','0')::numeric),0), count(*) FILTER (WHERE coalesce(rl->>'loyaltyDiscount','0')::numeric>(dl->>'discount')::numeric)
  INTO labelled, over_line
  FROM jsonb_array_elements(NEW.request->'lines') WITH ORDINALITY a(rl,n) JOIN jsonb_array_elements(NEW.lines) WITH ORDINALITY b(dl,n) ON a.n=b.n;
 IF labelled*100<>redeem THEN RAISE EXCEPTION 'Loyalty discount must equal the redeemed points'; END IF;
 IF redeem>0 THEN
  IF over_line>0 THEN RAISE EXCEPTION 'Loyalty discount exceeds the line discount'; END IF;
  IF NEW.total<=0 THEN RAISE EXCEPTION 'Loyalty points cannot cover the whole sale'; END IF;
  IF public.loyalty_balance(NEW.business_id,member_id)<redeem THEN RAISE EXCEPTION 'Loyalty points balance is lower than the points requested'; END IF;
  INSERT INTO public.loyalty_redemptions(business_id,branch_id,membership_id,sale_id,document_id,kind,points,discount,actor_id) VALUES(NEW.business_id,NEW.branch_id,member_id,NEW.id,NEW.id,'spend',-redeem,redeem/100.0,NEW.actor_id);
 END IF;
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
 -- Points spent on the original sale come back in proportion to the value returned (all of them on a full return). Earned points reverse as before.
 SELECT coalesce(-sum(points),0) INTO spent FROM public.loyalty_redemptions WHERE business_id=NEW.business_id AND sale_id=NEW.source_id AND kind='spend';
 IF spent>0 THEN
  SELECT coalesce(sum(points),0) INTO restored_total FROM public.loyalty_redemptions WHERE business_id=NEW.business_id AND sale_id=NEW.source_id AND kind='restore';
  IF original.total-returned<=0 THEN restore_now:=spent-restored_total;
  ELSE restore_now:=least(spent,floor(spent::numeric*returned/original.total)::bigint)-restored_total; END IF;
  IF restore_now>0 THEN INSERT INTO public.loyalty_redemptions(business_id,branch_id,membership_id,sale_id,document_id,kind,points,discount,actor_id) VALUES(NEW.business_id,NEW.branch_id,member_id,NEW.source_id,NEW.id,'restore',restore_now,restore_now/100.0,NEW.actor_id); END IF;
 END IF;
 END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.post_document_loyalty() FROM PUBLIC,anon,authenticated;

-- Customer summary now reports the spendable balance (earned + redemptions). Purchase count still counts sales only.
CREATE OR REPLACE FUNCTION public.read_customer_loyalty(_business_id uuid) RETURNS TABLE(mobile text,membership_number text,points text,purchase_count text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT m.mobile,m.membership_number,(e.pts+coalesce(r.pts,0))::text,e.cnt::text
 FROM public.customer_memberships m
 JOIN LATERAL (SELECT sum(points) pts,count(DISTINCT document_id) FILTER (WHERE document_id=sale_id) cnt FROM public.loyalty_point_events WHERE business_id=m.business_id AND membership_id=m.id HAVING count(*)>0) e ON true
 LEFT JOIN LATERAL (SELECT sum(points) pts FROM public.loyalty_redemptions WHERE business_id=m.business_id AND membership_id=m.id) r ON true
 WHERE m.business_id=_business_id AND public.is_business_member(_business_id) AND public.has_permission(_business_id,'customers.view')
 $$;

-- Checkout lookup: the current balance for one mobile number. Display only; the posting trigger re-checks under the business lock.
CREATE FUNCTION public.loyalty_available_points(_business uuid,_mobile text) RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE n text:=public.normalize_member_mobile(_mobile); m uuid;
BEGIN
 IF NOT public.has_business_role(_business,'staff') THEN RAISE EXCEPTION 'Loyalty access denied'; END IF;
 IF n IS NULL THEN RETURN 0; END IF;
 SELECT id INTO m FROM public.customer_memberships WHERE business_id=_business AND mobile=n;
 IF m IS NULL THEN RETURN 0; END IF;
 RETURN public.loyalty_balance(_business,m);
END $$;
REVOKE ALL ON FUNCTION public.loyalty_available_points(uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.loyalty_available_points(uuid,text) TO authenticated,service_role;

COMMENT ON TABLE public.loyalty_redemptions IS 'Immutable redemption evidence: spend (negative points, one per sale) and restore (positive, one per return). 100 points = NPR 1. Balance = loyalty_point_events + loyalty_redemptions.';
