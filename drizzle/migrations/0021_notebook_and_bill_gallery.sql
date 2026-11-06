-- 0021: Notebook and Bill Gallery.
-- Additive only: two new tenant-scoped tables and one private storage bucket with policies.
-- No existing table, policy, function or trigger is changed. Roll forward with a new migration; never edit this one.

-- ---------- Notebook ----------
CREATE TABLE public.business_notes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 1 AND 160),
  body text NOT NULL DEFAULT '' CHECK(char_length(body) <= 20000),
  pinned boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX business_notes_list_idx ON public.business_notes(business_id, pinned DESC, updated_at DESC);
CREATE TRIGGER business_notes_touch BEFORE UPDATE ON public.business_notes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.business_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY notes_read ON public.business_notes FOR SELECT TO authenticated USING(public.is_business_member(business_id));
CREATE POLICY notes_add ON public.business_notes FOR INSERT TO authenticated WITH CHECK(public.has_business_role(business_id,'staff') AND created_by = auth.uid());
CREATE POLICY notes_edit ON public.business_notes FOR UPDATE TO authenticated
  USING(public.has_business_role(business_id,'staff') AND (created_by = auth.uid() OR public.has_business_role(business_id,'admin')))
  WITH CHECK(public.has_business_role(business_id,'staff') AND (created_by = auth.uid() OR public.has_business_role(business_id,'admin')));
CREATE POLICY notes_delete ON public.business_notes FOR DELETE TO authenticated
  USING(public.has_business_role(business_id,'staff') AND (created_by = auth.uid() OR public.has_business_role(business_id,'admin')));
REVOKE ALL ON public.business_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.business_notes TO authenticated;
GRANT UPDATE(title, body, pinned) ON public.business_notes TO authenticated;

-- ---------- Bill Gallery ----------
CREATE TABLE public.business_bills(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  caption text NOT NULL DEFAULT '' CHECK(char_length(caption) <= 200),
  bill_date date NOT NULL DEFAULT current_date,
  mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_bills_path_in_tenant CHECK(storage_path LIKE business_id::text || '/%' AND storage_path !~ '\.\.')
);
CREATE INDEX business_bills_list_idx ON public.business_bills(business_id, bill_date DESC, created_at DESC);
ALTER TABLE public.business_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY bills_read ON public.business_bills FOR SELECT TO authenticated USING(public.is_business_member(business_id));
CREATE POLICY bills_add ON public.business_bills FOR INSERT TO authenticated WITH CHECK(public.has_business_role(business_id,'staff') AND created_by = auth.uid());
CREATE POLICY bills_edit ON public.business_bills FOR UPDATE TO authenticated
  USING(public.has_business_role(business_id,'staff') AND (created_by = auth.uid() OR public.has_business_role(business_id,'admin')))
  WITH CHECK(public.has_business_role(business_id,'staff') AND (created_by = auth.uid() OR public.has_business_role(business_id,'admin')));
CREATE POLICY bills_delete ON public.business_bills FOR DELETE TO authenticated
  USING(public.has_business_role(business_id,'staff') AND (created_by = auth.uid() OR public.has_business_role(business_id,'admin')));
REVOKE ALL ON public.business_bills FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.business_bills TO authenticated;
GRANT UPDATE(caption, bill_date) ON public.business_bills TO authenticated;

-- Private bucket; objects live under <business_id>/<file>. Same membership rules as the table above.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES('bills','bills',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION public.bill_object_business(_name text) RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN split_part(_name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN split_part(_name,'/',1)::uuid END
$$;
REVOKE EXECUTE ON FUNCTION public.bill_object_business(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bill_object_business(text) TO authenticated;

CREATE POLICY bills_objects_read ON storage.objects FOR SELECT TO authenticated
  USING(bucket_id = 'bills' AND public.is_business_member(public.bill_object_business(name)));
CREATE POLICY bills_objects_add ON storage.objects FOR INSERT TO authenticated
  WITH CHECK(bucket_id = 'bills' AND public.has_business_role(public.bill_object_business(name),'staff'));
CREATE POLICY bills_objects_delete ON storage.objects FOR DELETE TO authenticated
  USING(bucket_id = 'bills' AND public.has_business_role(public.bill_object_business(name),'staff') AND (owner = auth.uid() OR public.has_business_role(public.bill_object_business(name),'admin')));
