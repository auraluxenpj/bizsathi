ALTER TABLE public.profiles ADD COLUMN avatar_url text CHECK (avatar_url IS NULL OR (avatar_url LIKE 'https://%' AND char_length(avatar_url) <= 1000));
GRANT UPDATE (avatar_url) ON public.profiles TO authenticated;
CREATE TABLE public.security_review_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK (kind IN ('finding','report','disposition','approval','analysis','ai_block','ai_resume')),
 title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
 details text NOT NULL CHECK (char_length(details) BETWEEN 1 AND 12000),
 related_id uuid,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (business_id,id),
 FOREIGN KEY (business_id,related_id) REFERENCES public.security_review_events(business_id,id) ON DELETE RESTRICT
);
REVOKE ALL ON public.security_review_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.security_review_events TO authenticated;
GRANT INSERT (business_id,kind,title,details,related_id,payload) ON public.security_review_events TO authenticated;
GRANT SELECT, INSERT ON public.security_review_events TO service_role;
ALTER TABLE public.security_review_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY security_events_admin_read ON public.security_review_events FOR SELECT TO authenticated USING (public.has_business_role(business_id,'admin'));
CREATE POLICY security_events_admin_append ON public.security_review_events FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() AND public.has_business_role(business_id,'admin'));
CREATE INDEX security_review_events_business_time ON public.security_review_events(business_id,created_at DESC);
CREATE INDEX security_review_events_related ON public.security_review_events(business_id,related_id);
CREATE TRIGGER security_events_immutable BEFORE UPDATE OR DELETE ON public.security_review_events FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER security_events_no_truncate BEFORE TRUNCATE ON public.security_review_events FOR EACH STATEMENT EXECUTE FUNCTION public.block_mutation();