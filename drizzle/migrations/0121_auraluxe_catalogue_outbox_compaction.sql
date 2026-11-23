-- 0121: compact superseded full-state catalogue snapshots without replaying stale states.
ALTER TABLE public.auraluxe_catalogue_outbox
  DROP CONSTRAINT IF EXISTS auraluxe_catalogue_outbox_status_check;
ALTER TABLE public.auraluxe_catalogue_outbox
  ADD CONSTRAINT auraluxe_catalogue_outbox_status_check
  CHECK (status = ANY (ARRAY['pending','processing','delivered','dead','superseded']::text[]));

CREATE OR REPLACE FUNCTION public.claim_auraluxe_catalogue_outbox(
  _business_id uuid,
  _lease uuid,
  _limit integer DEFAULT 50
)
RETURNS SETOF public.auraluxe_catalogue_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role'
     OR _business_id <> 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid
     OR _lease IS NULL
     OR _limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Service authorization and valid lease required';
  END IF;

  IF NOT coalesce(
    (SELECT catalogue_enabled
       FROM public.auraluxe_sync_control
      WHERE business_id = _business_id),
    false
  ) THEN
    RETURN;
  END IF;

  -- Serialize compaction and claims. Older full-state snapshots are audit-retained
  -- but marked superseded when a newer snapshot for the same exact SKU exists.
  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text, 0));

  UPDATE public.auraluxe_catalogue_outbox older
     SET status = 'superseded',
         last_error = left(
           'Superseded by newer full-state snapshot #' ||
           (SELECT max(newer.id)::text
              FROM public.auraluxe_catalogue_outbox newer
             WHERE newer.business_id = older.business_id
               AND newer.sku = older.sku
               AND newer.id > older.id
               AND newer.status <> 'superseded'),
           1000
         ),
         lease_token = NULL,
         locked_until = NULL
   WHERE older.business_id = _business_id
     AND older.status = 'pending'
     AND EXISTS (
       SELECT 1
         FROM public.auraluxe_catalogue_outbox newer
        WHERE newer.business_id = older.business_id
          AND newer.sku = older.sku
          AND newer.id > older.id
          AND newer.status <> 'superseded'
     );

  RETURN QUERY
  WITH picked AS (
    SELECT candidate.id
      FROM public.auraluxe_catalogue_outbox candidate
     WHERE candidate.business_id = _business_id
       AND (
         (candidate.status = 'pending' AND candidate.available_at <= now())
         OR
         (candidate.status = 'processing' AND candidate.locked_until < now())
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.auraluxe_catalogue_outbox newer
          WHERE newer.business_id = candidate.business_id
            AND newer.sku = candidate.sku
            AND newer.id > candidate.id
            AND newer.status <> 'superseded'
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.auraluxe_catalogue_outbox earlier
          WHERE earlier.business_id = candidate.business_id
            AND earlier.sku = candidate.sku
            AND earlier.id < candidate.id
            AND earlier.status = 'processing'
       )
     ORDER BY candidate.id
     FOR UPDATE SKIP LOCKED
     LIMIT _limit
  )
  UPDATE public.auraluxe_catalogue_outbox o
     SET status = 'processing',
         lease_token = _lease,
         locked_until = now() + interval '2 minutes',
         attempts = attempts + 1
    FROM picked
   WHERE o.id = picked.id
  RETURNING o.*;
END
$function$;

REVOKE ALL ON FUNCTION public.claim_auraluxe_catalogue_outbox(uuid,uuid,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auraluxe_catalogue_outbox(uuid,uuid,integer)
  TO service_role;

COMMENT ON FUNCTION public.claim_auraluxe_catalogue_outbox(uuid,uuid,integer)
IS 'Claims only the newest non-superseded full-state snapshot per exact SKU; remains gated by catalogue_enabled and serializes in-flight events.';
