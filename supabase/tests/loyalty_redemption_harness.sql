
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
CREATE TABLE public.businesses(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(id uuid PRIMARY KEY);
CREATE TABLE public.branches(id uuid PRIMARY KEY, business_id uuid NOT NULL, UNIQUE(business_id,id));
CREATE TABLE public.business_settings(business_id uuid PRIMARY KEY, currency text NOT NULL DEFAULT 'NPR');
CREATE TABLE public.commerce_documents(id uuid PRIMARY KEY, business_id uuid NOT NULL, branch_id uuid NOT NULL, kind text NOT NULL, source_id uuid, status text NOT NULL, total numeric NOT NULL, lines jsonb NOT NULL, request jsonb NOT NULL, actor_id uuid, UNIQUE(business_id,id));
CREATE FUNCTION public.has_business_role(b uuid, r text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.can_access_branch(b uuid, br uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.is_business_member(b uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.has_permission(b uuid, p text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.block_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable'; END $$;
CREATE FUNCTION public.audit_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION public.normalize_member_mobile(_mobile text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$ DECLARE n text; BEGIN IF _mobile IS NULL OR length(_mobile)>40 OR _mobile !~ '^[+0-9 ()-]+$' THEN RETURN NULL; END IF; n:=regexp_replace(_mobile,'[ ()-]','','g'); IF n ~ '^\+977' THEN n:=substr(n,5); ELSIF n ~ '^977' AND length(n)=13 THEN n:=substr(n,4); END IF; IF n !~ '^9[78][0-9]{8}$' THEN RETURN NULL; END IF; RETURN n; END $$;
REVOKE ALL ON FUNCTION public.normalize_member_mobile(text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.normalize_member_mobile(text) TO authenticated,service_role;
CREATE TABLE public.customer_memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,mobile text NOT NULL CHECK(mobile ~ '^9[78][0-9]{8}$'),membership_number text GENERATED ALWAYS AS ('AL-'||mobile) STORED,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(business_id,mobile),UNIQUE(business_id,id));
REVOKE ALL ON public.customer_memberships FROM PUBLIC,anon,authenticated; GRANT SELECT ON public.customer_memberships TO authenticated; GRANT ALL ON public.customer_memberships TO service_role;
ALTER TABLE public.customer_memberships ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.loyalty_point_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,branch_id uuid NOT NULL,membership_id uuid NOT NULL,document_id uuid NOT NULL,sale_id uuid NOT NULL,points bigint NOT NULL,actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(business_id,document_id),FOREIGN KEY(business_id,branch_id) REFERENCES public.branches(business_id,id) ON DELETE RESTRICT,FOREIGN KEY(business_id,membership_id) REFERENCES public.customer_memberships(business_id,id) ON DELETE RESTRICT,FOREIGN KEY(business_id,document_id) REFERENCES public.commerce_documents(business_id,id) ON DELETE RESTRICT,FOREIGN KEY(business_id,sale_id) REFERENCES public.commerce_documents(business_id,id) ON DELETE RESTRICT);
REVOKE ALL ON public.loyalty_point_events FROM PUBLIC,anon,authenticated; GRANT SELECT ON public.loyalty_point_events TO authenticated; GRANT ALL ON public.loyalty_point_events TO service_role;
ALTER TABLE public.loyalty_point_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY loyalty_events_read ON public.loyalty_point_events FOR SELECT TO authenticated USING(public.can_access_branch(business_id,branch_id));
CREATE POLICY customer_memberships_read ON public.customer_memberships FOR SELECT TO authenticated USING(public.is_business_member(business_id) AND EXISTS(SELECT 1 FROM public.loyalty_point_events e WHERE e.business_id=customer_memberships.business_id AND e.membership_id=customer_memberships.id));
CREATE INDEX loyalty_member_lookup ON public.loyalty_point_events(business_id,membership_id);
CREATE INDEX loyalty_sale_lookup ON public.loyalty_point_events(business_id,sale_id);
CREATE TRIGGER customer_membership_immutable BEFORE UPDATE OR DELETE ON public.customer_memberships FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER loyalty_events_immutable BEFORE UPDATE OR DELETE ON public.loyalty_point_events FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER loyalty_events_audit AFTER INSERT ON public.loyalty_point_events FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER customer_membership_audit AFTER INSERT ON public.customer_memberships FOR EACH ROW EXECUTE FUNCTION public.audit_row();
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
CREATE TRIGGER commerce_document_loyalty AFTER INSERT ON public.commerce_documents FOR EACH ROW EXECUTE FUNCTION public.post_document_loyalty();
COMMENT ON TABLE public.customer_memberships IS 'Mobile loyalty identity; separate from login roles and existing parties. Only created atomically with new sales.';
COMMENT ON TABLE public.loyalty_point_events IS 'Immutable whole points: floor(final NPR sale total/100), adjusted to floor(remaining sale net total/100) on returns; read balances over authorized branches only.';