-- Serialize native stock deductions with website reservations and preserve
-- strict FIFO delivery for absolute stock projections. Git-only until release approval.

CREATE OR REPLACE FUNCTION public.guard_website_reserved_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE reserved numeric;
BEGIN
  IF NEW.quantity < 0 THEN
    -- Use the exact transaction lock acquired by reserve_website_inventory.
    -- A native deduction and a website reservation for this business cannot
    -- both validate against the same pre-commit stock snapshot.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.business_id::text,0));

    SELECT coalesce(sum(i.quantity),0) INTO reserved
    FROM public.website_inventory_reservation_items i
    JOIN public.website_inventory_reservations r
      ON r.business_id=i.business_id AND r.id=i.reservation_id
    WHERE i.business_id=NEW.business_id AND i.variant_id=NEW.variant_id
      AND r.branch_id=NEW.branch_id AND r.status='reserved';

    IF public.commerce_stock_balance(NEW.business_id,NEW.branch_id,NEW.variant_id)+NEW.quantity < reserved THEN
      RAISE EXCEPTION 'Stock is reserved for a website order';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_website_reserved_stock() FROM PUBLIC,anon,authenticated;

-- Projection events contain absolute available quantities. Delivering a newer
-- event before an older retry could overwrite the website with stale stock.
-- Only the oldest unpublished event may be leased; backoff/dead-letter blocks
-- later events until an operator resolves the head of the queue.
CREATE OR REPLACE FUNCTION public.claim_website_inventory_outbox(
  _business_id uuid,
  _lease_token uuid,
  _limit integer DEFAULT 10
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  oldest public.website_inventory_outbox;
  claimed public.website_inventory_outbox;
BEGIN
  PERFORM public.website_inventory_require_service();
  IF _business_id IS NULL OR _lease_token IS NULL OR _limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Invalid website inventory outbox claim';
  END IF;
  IF NOT public.website_inventory_integration_enabled(_business_id) THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Serialize claim decisions across scheduled and opportunistic publishers.
  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,1));

  UPDATE public.website_inventory_outbox
     SET dead_lettered_at=now(),
         last_error=coalesce(last_error,'publisher lease expired too many times'),
         lease_token=NULL,
         lease_until=NULL
   WHERE business_id=_business_id
     AND published_at IS NULL
     AND dead_lettered_at IS NULL
     AND attempt_count>=10
     AND (lease_until IS NULL OR lease_until<=now());

  SELECT * INTO oldest
    FROM public.website_inventory_outbox
   WHERE business_id=_business_id AND published_at IS NULL
   ORDER BY id
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND
     OR oldest.dead_lettered_at IS NOT NULL
     OR oldest.next_attempt_at>now()
     OR oldest.lease_until>now()
     OR oldest.attempt_count>=10 THEN
    RETURN '[]'::jsonb;
  END IF;

  UPDATE public.website_inventory_outbox
     SET lease_token=_lease_token,
         lease_until=now()+interval '2 minutes',
         attempt_count=attempt_count+1,
         last_attempt_at=now()
   WHERE business_id=_business_id AND id=oldest.id
   RETURNING * INTO claimed;

  RETURN jsonb_build_array(jsonb_build_object(
    'id',claimed.id,
    'branchId',claimed.branch_id,
    'reservationId',claimed.reservation_id,
    'eventType',claimed.event_type,
    'payload',claimed.payload,
    'createdAt',claimed.created_at,
    'attemptCount',claimed.attempt_count,
    'lastError',claimed.last_error,
    'lastAttemptAt',claimed.last_attempt_at
  ));
END $$;

REVOKE ALL ON FUNCTION public.claim_website_inventory_outbox(uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_website_inventory_outbox(uuid,uuid,integer)
  TO service_role;

COMMENT ON FUNCTION public.guard_website_reserved_stock() IS
  'Serializes native stock deductions with website reservations using the shared business advisory transaction lock.';
COMMENT ON FUNCTION public.claim_website_inventory_outbox(uuid,uuid,integer) IS
  'Leases only the oldest unpublished event; backoff and dead-letter states block later absolute projections to prevent stale overwrites.';
