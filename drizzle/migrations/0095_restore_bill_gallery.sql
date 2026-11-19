-- 0095: restore the Bill Gallery data table and private file storage.
-- The original 0021 migration was intentionally disabled because business_notes
-- already existed. This migration adds only the missing bill-gallery resources.

CREATE TABLE IF NOT EXISTS public.business_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 200),
  bill_date date NOT NULL DEFAULT current_date,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_bills_path_in_tenant
    CHECK (storage_path LIKE business_id::text || '/%' AND storage_path !~ '\.\.')
);

CREATE INDEX IF NOT EXISTS business_bills_list_idx
  ON public.business_bills (business_id, bill_date DESC, created_at DESC);

ALTER TABLE public.business_bills ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_bills FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.business_bills TO authenticated;
GRANT UPDATE (caption, bill_date) ON public.business_bills TO authenticated;
GRANT ALL ON public.business_bills TO service_role;

DROP POLICY IF EXISTS bills_read ON public.business_bills;
CREATE POLICY bills_read ON public.business_bills
  FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));

DROP POLICY IF EXISTS bills_add ON public.business_bills;
CREATE POLICY bills_add ON public.business_bills
  FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(business_id,'staff') AND created_by = auth.uid());

DROP POLICY IF EXISTS bills_edit ON public.business_bills;
CREATE POLICY bills_edit ON public.business_bills
  FOR UPDATE TO authenticated
  USING (public.has_business_role(business_id,'staff')
    AND (created_by = auth.uid() OR public.has_business_role(business_id,'admin')))
  WITH CHECK (public.has_business_role(business_id,'staff')
    AND (created_by = auth.uid() OR public.has_business_role(business_id,'admin')));

DROP POLICY IF EXISTS bills_delete ON public.business_bills;
CREATE POLICY bills_delete ON public.business_bills
  FOR DELETE TO authenticated
  USING (public.has_business_role(business_id,'staff')
    AND (created_by = auth.uid() OR public.has_business_role(business_id,'admin')));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bills', 'bills', false, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS bills_objects_read ON storage.objects;
CREATE POLICY bills_objects_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'bills'
    AND public.is_business_member(public.bill_object_business(name)));

DROP POLICY IF EXISTS bills_objects_add ON storage.objects;
CREATE POLICY bills_objects_add ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bills'
    AND public.has_business_role(public.bill_object_business(name),'staff'));

DROP POLICY IF EXISTS bills_objects_delete ON storage.objects;
CREATE POLICY bills_objects_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'bills'
    AND public.has_business_role(public.bill_object_business(name),'staff')
    AND (owner = auth.uid()
      OR public.has_business_role(public.bill_object_business(name),'admin')));
