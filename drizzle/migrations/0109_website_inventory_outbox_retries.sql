-- Durable retry leases for the BizSathi -> Auraluxe stock projection outbox.
-- The schedule is dormant until the integration row is explicitly enabled.

ALTER TABLE public.website_inventory_outbox
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN lease_token uuid,
  ADD COLUMN lease_until timestamptz,
  ADD COLUMN dead_lettered_at timestamptz;

CREATE INDEX website_inventory_outbox_due
  ON public.website_inventory_outbox(business_id,next_attempt_at,id)
  WHERE published_at IS NULL AND dead_lettered_at IS NULL;

CREATE FUNCTION public.website_inventory_integration_enabled(_business_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.website_inventory_require_service();
  RETURN coalesce((
    SELECT enabled FROM public.website_inventory_integrations WHERE business_id=_business_id
  ),false);
END $$;
REVOKE ALL ON FUNCTION public.website_inventory_integration_enabled(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.website_inventory_integration_enabled(uuid) TO service_role;

CREATE FUNCTION public.claim_website_inventory_outbox(
  _business_id uuid,
  _lease_token uuid,
  _limit integer DEFAULT 10
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $
DECLARE result jsonb;
BEGIN
  PERFORM public.website_inventory_require_service();
  IF _business_id IS NULL OR _lease_token IS NULL OR _limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Invalid website inventory outbox claim';
  END IF;
  IF NOT public.website_inventory_integration_enabled(_business_id) THEN
    RETURN '[]'::jsonb;
  END IF;

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

  WITH candidates AS (
    SELECT id
      FROM public.website_inventory_outbox
     WHERE business_id=_business_id
       AND published_at IS NULL
       AND dead_lettered_at IS NULL
       AND attempt_count<10
       AND next_attempt_at<=now()
       AND (lease_until IS NULL OR lease_until<=now())
     ORDER BY id
     LIMIT _limit
     FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.website_inventory_outbox o
       SET lease_token=_lease_token,
           lease_until=now()+interval '2 minutes',
           attempt_count=o.attempt_count+1,
           last_attempt_at=now()
      FROM candidates c
     WHERE o.id=c.id
     RETURNING o.*
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',id,
    'branchId',branch_id,
    'reservationId',reservation_id,
    'eventType',event_type,
    'payload',payload,
    'createdAt',created_at,
    'attemptCount',attempt_count,
    'lastError',last_error,
    'lastAttemptAt',last_attempt_at
  ) ORDER BY id),'[]'::jsonb)
    INTO result
    FROM claimed;
  RETURN result;
END $$;

CREATE FUNCTION public.ack_website_inventory_outbox_event(
  _business_id uuid,
  _event_id bigint,
  _lease_token uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected integer;
BEGIN
  PERFORM public.website_inventory_require_service();
  UPDATE public.website_inventory_outbox
     SET published_at=now(),
         last_error=NULL,
         lease_token=NULL,
         lease_until=NULL
   WHERE business_id=_business_id AND id=_event_id
     AND published_at IS NULL AND lease_token=_lease_token;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected=1;
END $$;

CREATE FUNCTION public.fail_website_inventory_outbox_event(
  _business_id uuid,
  _event_id bigint,
  _lease_token uuid,
  _error text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected integer;
BEGIN
  PERFORM public.website_inventory_require_service();
  UPDATE public.website_inventory_outbox
     SET last_error=left(coalesce(_error,'website projection failed'),500),
         next_attempt_at=now()+make_interval(mins=>least(60,(2^least(attempt_count,6))::integer)),
         dead_lettered_at=CASE WHEN attempt_count>=10 THEN now() ELSE NULL END,
         lease_token=NULL,
         lease_until=NULL
   WHERE business_id=_business_id AND id=_event_id
     AND published_at IS NULL AND lease_token=_lease_token;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected=1;
END $$;

REVOKE ALL ON FUNCTION public.claim_website_inventory_outbox(uuid,uuid,integer),
  public.ack_website_inventory_outbox_event(uuid,bigint,uuid),
  public.fail_website_inventory_outbox_event(uuid,bigint,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_website_inventory_outbox(uuid,uuid,integer),
  public.ack_website_inventory_outbox_event(uuid,bigint,uuid),
  public.fail_website_inventory_outbox_event(uuid,bigint,uuid,text)
  TO service_role;

COMMENT ON COLUMN public.website_inventory_outbox.lease_token IS
  'Service-only claim token preventing concurrent publishers from processing the same event.';
COMMENT ON COLUMN public.website_inventory_outbox.dead_lettered_at IS
  'Set after ten failed delivery attempts; dead-lettered events require explicit operator review.';
