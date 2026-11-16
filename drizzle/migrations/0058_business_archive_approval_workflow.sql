-- 0058: Business archiving requires a Business Owner request and Master Owner approval.
-- This migration is additive. It does not archive any business or modify existing membership data.

CREATE TABLE public.business_archive_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_reason text NOT NULL CHECK (char_length(btrim(request_reason)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CONSTRAINT business_archive_review_fields_check CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX business_archive_requests_business_created_idx
  ON public.business_archive_requests (business_id, created_at DESC);
CREATE UNIQUE INDEX business_archive_requests_one_pending_per_business
  ON public.business_archive_requests (business_id) WHERE status = 'pending';

ALTER TABLE public.business_archive_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_archive_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.business_archive_requests TO service_role;

-- Disable the old one-step archive RPC. Archiving is now possible only through
-- review_business_archive_request(), which verifies the platform Master Owner.
REVOKE ALL ON FUNCTION public.archive_business(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.request_business_archive(_business_id uuid, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  request_id uuid;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR char_length(btrim(_reason)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Please provide a reason of up to 1000 characters' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses b
    JOIN public.business_memberships m ON m.business_id = b.id
    WHERE b.id = _business_id AND b.archived_at IS NULL
      AND m.user_id = actor AND m.role_code = 'owner' AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only this business''s active Business Owner can request archiving'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.business_archive_requests(business_id, requested_by, request_reason)
  VALUES (_business_id, actor, btrim(_reason))
  RETURNING id INTO request_id;

  PERFORM public.write_audit(
    _business_id, 'business.archive_requested', 'business_archive_requests', request_id::text,
    NULL, jsonb_build_object('requested_by', actor, 'reason', btrim(_reason))
  );
  RETURN request_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'An archive request is already pending for this business'
      USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.list_business_archive_requests(_business_id uuid)
RETURNS TABLE (
  id uuid,
  business_id uuid,
  requested_by uuid,
  request_reason text,
  status text,
  reviewed_by uuid,
  review_note text,
  created_at timestamptz,
  reviewed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.platform_owner_check(auth.uid())
     AND NOT EXISTS (
       SELECT 1 FROM public.business_memberships m
       WHERE m.business_id = _business_id AND m.user_id = auth.uid()
         AND m.role_code = 'owner' AND m.status = 'active'
     ) THEN
    RAISE EXCEPTION 'Only this Business Owner or the platform Master Owner can view archive requests'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.id, r.business_id, r.requested_by, r.request_reason, r.status,
         r.reviewed_by, r.review_note, r.created_at, r.reviewed_at
  FROM public.business_archive_requests r
  WHERE r.business_id = _business_id
  ORDER BY r.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_business_archive_request(
  _request_id uuid,
  _approve boolean,
  _review_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  archive_request public.business_archive_requests%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT public.platform_owner_check(actor) THEN
    RAISE EXCEPTION 'Only the platform Master Owner can review business archive requests'
      USING ERRCODE = '42501';
  END IF;
  IF _review_note IS NOT NULL AND char_length(_review_note) > 1000 THEN
    RAISE EXCEPTION 'Review note must be 1000 characters or fewer' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO archive_request
  FROM public.business_archive_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND OR archive_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Pending archive request not found' USING ERRCODE = 'P0002';
  END IF;

  IF _approve THEN
    UPDATE public.businesses
    SET archived_at = now()
    WHERE id = archive_request.business_id AND archived_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Business is already archived or unavailable' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  UPDATE public.business_archive_requests
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = actor,
      review_note = NULLIF(btrim(_review_note), ''),
      reviewed_at = now()
  WHERE id = _request_id;

  PERFORM public.write_audit(
    archive_request.business_id,
    CASE WHEN _approve THEN 'business.archive_approved' ELSE 'business.archive_rejected' END,
    'business_archive_requests',
    _request_id::text,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object(
      'status', CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      'reviewed_by', actor,
      'review_note', NULLIF(btrim(_review_note), '')
    )
  );

  IF _approve THEN
    PERFORM public.write_audit(
      archive_request.business_id, 'business.archived', 'businesses',
      archive_request.business_id::text, NULL,
      jsonb_build_object('archived_at', now(), 'approved_by', actor, 'archive_request_id', _request_id)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.request_business_archive(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_business_archive_requests(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_business_archive_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_business_archive(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_business_archive_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_business_archive_request(uuid, boolean, text) TO authenticated;
