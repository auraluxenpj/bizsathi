-- Standalone live-schema-compatible additive migration artifact.
-- Verified tenant: Auraluxe 985f4fd7-edcd-41a9-beec-8148fcb29818;
-- Nepalgunj branch 604f84f3-7290-4a3b-b1d9-745dfdc33c2a.
-- No rows are seeded, no switch is enabled, and no stock or financial data changes.
-- Apply only through the managed migration tool after pending-history replay is resolved.

-- Transactional website reservations for the Auraluxe integration.
-- Git-only until separately approved for production. No expiry silently releases reservations.

CREATE TABLE public.website_inventory_integrations (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(business_id,branch_id) REFERENCES public.branches(business_id,id) ON DELETE RESTRICT
);
REVOKE ALL ON public.website_inventory_integrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.website_inventory_integrations TO service_role;
ALTER TABLE public.website_inventory_integrations ENABLE ROW LEVEL SECURITY;

-- No configuration row is seeded. Bind Nepalgunj explicitly through the disabled admin workflow.

CREATE TABLE public.website_inventory_reservations (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 1 AND 160),
  status text NOT NULL CHECK(status IN ('reserved','committed','cancelled')),
  request jsonb NOT NULL CHECK(jsonb_typeof(request)='array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  finalization_reference text,
  UNIQUE(business_id,id),
  FOREIGN KEY(business_id,branch_id) REFERENCES public.branches(business_id,id) ON DELETE RESTRICT
);
CREATE INDEX website_inventory_reservations_active
  ON public.website_inventory_reservations(business_id,branch_id,status,created_at)
  WHERE status='reserved';
REVOKE ALL ON public.website_inventory_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.website_inventory_reservations TO service_role;
ALTER TABLE public.website_inventory_reservations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.website_inventory_reservation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  sku text NOT NULL,
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000000),
  UNIQUE(reservation_id,variant_id),
  FOREIGN KEY(business_id,reservation_id) REFERENCES public.website_inventory_reservations(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(business_id,variant_id) REFERENCES public.product_variants(business_id,id) ON DELETE RESTRICT
);
CREATE INDEX website_inventory_reservation_items_variant
  ON public.website_inventory_reservation_items(business_id,variant_id,reservation_id);
REVOKE ALL ON public.website_inventory_reservation_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.website_inventory_reservation_items TO service_role;
ALTER TABLE public.website_inventory_reservation_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.website_inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  sku text NOT NULL,
  quantity integer NOT NULL CHECK(quantity<0),
  reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reservation_id,variant_id),
  FOREIGN KEY(business_id,reservation_id) REFERENCES public.website_inventory_reservations(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(business_id,branch_id) REFERENCES public.branches(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(business_id,variant_id) REFERENCES public.product_variants(business_id,id) ON DELETE RESTRICT
);
CREATE INDEX website_inventory_movements_balance
  ON public.website_inventory_movements(business_id,branch_id,variant_id);
REVOKE ALL ON public.website_inventory_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.website_inventory_movements TO authenticated;
GRANT ALL ON public.website_inventory_movements TO service_role;
ALTER TABLE public.website_inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY website_inventory_movements_read ON public.website_inventory_movements
  FOR SELECT TO authenticated
  USING(public.can_access_branch(business_id,branch_id) AND public.has_permission(business_id,'inventory.view'));
CREATE TRIGGER website_inventory_movements_immutable
  BEFORE UPDATE OR DELETE ON public.website_inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER website_inventory_movements_audit
  AFTER INSERT ON public.website_inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

CREATE TABLE public.website_inventory_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  event_type text NOT NULL CHECK(event_type IN ('reserved','committed','cancelled')),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
  last_error text,
  last_attempt_at timestamptz,
  FOREIGN KEY(business_id,branch_id) REFERENCES public.branches(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(business_id,reservation_id) REFERENCES public.website_inventory_reservations(business_id,id) ON DELETE RESTRICT
);
CREATE INDEX website_inventory_outbox_pending
  ON public.website_inventory_outbox(business_id,id) WHERE published_at IS NULL;
REVOKE ALL ON public.website_inventory_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.website_inventory_outbox TO service_role;
ALTER TABLE public.website_inventory_outbox ENABLE ROW LEVEL SECURITY;

-- Include committed website sales in the same on-hand quantity ledger read by POS and reports.
CREATE OR REPLACE FUNCTION public.commerce_stock_balance(_business uuid,_branch uuid,_variant uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    coalesce((SELECT sum(quantity) FROM public.stock_movements WHERE business_id=_business AND branch_id=_branch AND variant_id=_variant),0)
    + coalesce((SELECT sum(quantity) FROM public.commerce_stock_movements WHERE business_id=_business AND branch_id=_branch AND variant_id=_variant),0)
    + coalesce((SELECT sum(quantity) FROM public.website_inventory_movements WHERE business_id=_business AND branch_id=_branch AND variant_id=_variant),0);
$$;
REVOKE ALL ON FUNCTION public.commerce_stock_balance(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_stock_balance(uuid,uuid,uuid) TO service_role;

-- Every native BizSathi stock deduction must leave enough stock for outstanding website reservations.
CREATE FUNCTION public.guard_website_reserved_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE reserved numeric;
BEGIN
  IF NEW.quantity < 0 THEN
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
REVOKE ALL ON FUNCTION public.guard_website_reserved_stock() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER website_reserved_stock_guard_commerce
  BEFORE INSERT ON public.commerce_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_website_reserved_stock();
CREATE TRIGGER website_reserved_stock_guard_legacy
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_website_reserved_stock();

CREATE FUNCTION public.website_inventory_require_service() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Website inventory service authorization required';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.website_inventory_require_service() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.reserve_website_inventory(
  _business_id uuid, _operation_id uuid, _branch_id uuid, _reference text, _items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  integration public.website_inventory_integrations;
  existing public.website_inventory_reservations;
  row_item jsonb;
  v_variant_id uuid;
  normalized_sku text;
  qty integer;
  matched integer;
  on_hand numeric;
  reserved numeric;
  normalized_items jsonb := '[]'::jsonb;
  result_items jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.website_inventory_require_service();
  IF _operation_id IS NULL OR _business_id IS NULL OR _branch_id IS NULL
     OR coalesce(length(btrim(_reference)),0) NOT BETWEEN 1 AND 160
     OR _items IS NULL OR jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Invalid website reservation request';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,0));
  SELECT * INTO integration FROM public.website_inventory_integrations
    WHERE business_id=_business_id AND branch_id=_branch_id AND enabled FOR SHARE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.branches WHERE business_id=_business_id AND id=_branch_id AND is_active) THEN
    RAISE EXCEPTION 'Website inventory integration is not enabled for this branch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) x
    GROUP BY lower(btrim(x->>'sku')) HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'Duplicate SKU lines must be combined'; END IF;

  FOR row_item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    normalized_sku:=lower(btrim(row_item->>'sku'));
    IF normalized_sku IS NULL OR normalized_sku='' OR length(normalized_sku)>80
       OR (row_item->>'quantity') IS NULL
       OR (row_item->>'quantity') !~ '^[1-9][0-9]{0,6}$' THEN
      RAISE EXCEPTION 'Invalid SKU or quantity';
    END IF;
    qty:=(row_item->>'quantity')::integer;
    SELECT count(*),(array_agg(v.id))[1] INTO matched,v_variant_id
    FROM public.product_variants v
    JOIN public.products p ON p.business_id=v.business_id AND p.id=v.product_id
    WHERE v.business_id=_business_id AND lower(btrim(v.sku))=normalized_sku
      AND v.is_active AND p.is_active;
    IF matched<>1 THEN RAISE EXCEPTION 'SKU is missing or ambiguous: %',normalized_sku; END IF;
    normalized_items:=normalized_items||jsonb_build_array(jsonb_build_object('sku',normalized_sku,'quantity',qty,'variantId',v_variant_id));
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY value->>'sku'),'[]'::jsonb)
    INTO normalized_items FROM jsonb_array_elements(normalized_items);

  SELECT * INTO existing FROM public.website_inventory_reservations
    WHERE business_id=_business_id AND id=_operation_id FOR UPDATE;
  IF FOUND THEN
    IF existing.branch_id=_branch_id AND existing.reference=btrim(_reference)
       AND existing.request=normalized_items AND existing.status IN ('reserved','committed') THEN
      RETURN jsonb_build_object('operationId',_operation_id,'status',existing.status,'duplicate',true);
    END IF;
    RAISE EXCEPTION 'Operation identifier already used with different input or final state';
  END IF;

  FOR row_item IN SELECT value FROM jsonb_array_elements(normalized_items) LOOP
    v_variant_id:=(row_item->>'variantId')::uuid;
    qty:=(row_item->>'quantity')::integer;
    on_hand:=public.commerce_stock_balance(_business_id,_branch_id,v_variant_id);
    SELECT coalesce(sum(i.quantity),0) INTO reserved
    FROM public.website_inventory_reservation_items i
    JOIN public.website_inventory_reservations r ON r.business_id=i.business_id AND r.id=i.reservation_id
    WHERE i.business_id=_business_id AND i.variant_id=v_variant_id AND r.branch_id=_branch_id AND r.status='reserved';
    IF on_hand-reserved<qty THEN RAISE EXCEPTION 'Insufficient available stock for SKU %',row_item->>'sku'; END IF;
  END LOOP;

  INSERT INTO public.website_inventory_reservations(id,business_id,branch_id,reference,status,request)
    VALUES(_operation_id,_business_id,_branch_id,btrim(_reference),'reserved',normalized_items);
  FOR row_item IN SELECT value FROM jsonb_array_elements(normalized_items) LOOP
    INSERT INTO public.website_inventory_reservation_items(business_id,reservation_id,variant_id,sku,quantity)
      VALUES(_business_id,_operation_id,(row_item->>'variantId')::uuid,row_item->>'sku',(row_item->>'quantity')::integer);
    result_items:=result_items||jsonb_build_array(jsonb_build_object('sku',row_item->>'sku','quantity',(row_item->>'quantity')::integer,
      'onHand',public.commerce_stock_balance(_business_id,_branch_id,(row_item->>'variantId')::uuid),
      'reserved',coalesce((SELECT sum(i.quantity) FROM public.website_inventory_reservation_items i
        JOIN public.website_inventory_reservations r ON r.business_id=i.business_id AND r.id=i.reservation_id
        WHERE i.business_id=_business_id AND i.variant_id=(row_item->>'variantId')::uuid AND r.branch_id=_branch_id AND r.status='reserved'),0),
      'available',public.commerce_stock_balance(_business_id,_branch_id,(row_item->>'variantId')::uuid)-coalesce((SELECT sum(i.quantity) FROM public.website_inventory_reservation_items i
        JOIN public.website_inventory_reservations r ON r.business_id=i.business_id AND r.id=i.reservation_id
        WHERE i.business_id=_business_id AND i.variant_id=(row_item->>'variantId')::uuid AND r.branch_id=_branch_id AND r.status='reserved'),0)));
  END LOOP;
  INSERT INTO public.website_inventory_outbox(business_id,branch_id,reservation_id,event_type,payload)
    VALUES(_business_id,_branch_id,_operation_id,'reserved',jsonb_build_object('operationId',_operation_id,'items',result_items));
  RETURN jsonb_build_object('operationId',_operation_id,'status','reserved','duplicate',false,'items',result_items);
END $$;

CREATE FUNCTION public.finalize_website_inventory(
  _business_id uuid, _operation_id uuid, _action text, _reference text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  reservation public.website_inventory_reservations;
  item record;
  event_items jsonb := '[]'::jsonb;
  new_status text;
BEGIN
  PERFORM public.website_inventory_require_service();
  IF _action IS NULL OR _action NOT IN ('commit','cancel') OR coalesce(length(btrim(_reference)),0) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Invalid reservation finalization';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,0));
  SELECT * INTO reservation FROM public.website_inventory_reservations
    WHERE business_id=_business_id AND id=_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
  IF reservation.status='committed' AND _action='commit' THEN
    IF reservation.finalization_reference IS DISTINCT FROM btrim(_reference) THEN RAISE EXCEPTION 'Finalization retry payload changed'; END IF;
    RETURN jsonb_build_object('operationId',_operation_id,'status','committed','duplicate',true);
  ELSIF reservation.status='cancelled' AND _action='cancel' THEN
    IF reservation.finalization_reference IS DISTINCT FROM btrim(_reference) THEN RAISE EXCEPTION 'Finalization retry payload changed'; END IF;
    RETURN jsonb_build_object('operationId',_operation_id,'status','cancelled','duplicate',true);
  ELSIF reservation.status<>'reserved' THEN
    RAISE EXCEPTION 'Reservation already finalized differently';
  END IF;

  IF _action='commit' THEN
    UPDATE public.website_inventory_reservations SET status='committed',finalized_at=now(),finalization_reference=btrim(_reference)
      WHERE business_id=_business_id AND id=_operation_id;
    FOR item IN SELECT * FROM public.website_inventory_reservation_items
      WHERE business_id=_business_id AND reservation_id=_operation_id ORDER BY variant_id LOOP
      INSERT INTO public.website_inventory_movements(business_id,branch_id,reservation_id,variant_id,sku,quantity,reference)
        VALUES(_business_id,reservation.branch_id,_operation_id,item.variant_id,item.sku,-item.quantity,btrim(_reference));
      event_items:=event_items||jsonb_build_array(jsonb_build_object('sku',item.sku,'quantity',item.quantity,
        'onHand',public.commerce_stock_balance(_business_id,reservation.branch_id,item.variant_id),
        'reserved',coalesce((SELECT sum(i.quantity) FROM public.website_inventory_reservation_items i
          JOIN public.website_inventory_reservations r ON r.business_id=i.business_id AND r.id=i.reservation_id
          WHERE i.business_id=_business_id AND i.variant_id=item.variant_id AND r.branch_id=reservation.branch_id AND r.status='reserved'),0),
        'available',public.commerce_stock_balance(_business_id,reservation.branch_id,item.variant_id)-coalesce((SELECT sum(i.quantity) FROM public.website_inventory_reservation_items i
          JOIN public.website_inventory_reservations r ON r.business_id=i.business_id AND r.id=i.reservation_id
          WHERE i.business_id=_business_id AND i.variant_id=item.variant_id AND r.branch_id=reservation.branch_id AND r.status='reserved'),0)));
    END LOOP;
    new_status:='committed';
  ELSE
    UPDATE public.website_inventory_reservations SET status='cancelled',finalized_at=now(),finalization_reference=btrim(_reference)
      WHERE business_id=_business_id AND id=_operation_id;
    FOR item IN SELECT * FROM public.website_inventory_reservation_items
      WHERE business_id=_business_id AND reservation_id=_operation_id ORDER BY variant_id LOOP
      event_items:=event_items||jsonb_build_array(jsonb_build_object('sku',item.sku,'quantity',item.quantity,
        'onHand',public.commerce_stock_balance(_business_id,reservation.branch_id,item.variant_id),
        'reserved',coalesce((SELECT sum(i.quantity) FROM public.website_inventory_reservation_items i
          JOIN public.website_inventory_reservations r ON r.business_id=i.business_id AND r.id=i.reservation_id
          WHERE i.business_id=_business_id AND i.variant_id=item.variant_id AND r.branch_id=reservation.branch_id AND r.status='reserved'),0),
        'available',public.commerce_stock_balance(_business_id,reservation.branch_id,item.variant_id)-coalesce((SELECT sum(i.quantity) FROM public.website_inventory_reservation_items i
          JOIN public.website_inventory_reservations r ON r.business_id=i.business_id AND r.id=i.reservation_id
          WHERE i.business_id=_business_id AND i.variant_id=item.variant_id AND r.branch_id=reservation.branch_id AND r.status='reserved'),0)));
    END LOOP;
    new_status:='cancelled';
  END IF;
  INSERT INTO public.website_inventory_outbox(business_id,branch_id,reservation_id,event_type,payload)
    VALUES(_business_id,reservation.branch_id,_operation_id,new_status,
      jsonb_build_object('operationId',_operation_id,'reference',btrim(_reference),'items',event_items));
  RETURN jsonb_build_object('operationId',_operation_id,'status',new_status,'duplicate',false,'items',event_items);
END $$;

CREATE FUNCTION public.website_inventory_branch(_business_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $branch$
DECLARE selected_branch uuid;
BEGIN
  PERFORM public.website_inventory_require_service();
  SELECT branch_id INTO selected_branch FROM public.website_inventory_integrations
    WHERE business_id=_business_id;
  RETURN selected_branch;
END $branch$;

CREATE FUNCTION public.website_inventory_status(_business_id uuid, _operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $status$
DECLARE reservation public.website_inventory_reservations;
BEGIN
  PERFORM public.website_inventory_require_service();
  SELECT * INTO reservation FROM public.website_inventory_reservations
    WHERE business_id=_business_id AND id=_operation_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('operationId',_operation_id,'status','not_found'); END IF;
  RETURN jsonb_build_object('operationId',_operation_id,'status',reservation.status,
    'reference',reservation.reference,'finalizationReference',reservation.finalization_reference,
    'createdAt',reservation.created_at,'finalizedAt',reservation.finalized_at);
END $status$;

CREATE FUNCTION public.read_website_inventory_outbox(
  _business_id uuid, _after_id bigint DEFAULT 0, _limit integer DEFAULT 100
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.website_inventory_require_service();
  IF _after_id<0 OR _limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid outbox cursor'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'branchId',branch_id,'reservationId',reservation_id,
    'eventType',event_type,'payload',payload,'createdAt',created_at,'attemptCount',attempt_count,'lastError',last_error,'lastAttemptAt',last_attempt_at) ORDER BY id)
    FROM (SELECT * FROM public.website_inventory_outbox WHERE business_id=_business_id AND id>_after_id AND published_at IS NULL ORDER BY id LIMIT _limit) q),'[]'::jsonb);
END $$;

CREATE FUNCTION public.record_website_inventory_outbox_failure(_business_id uuid,_event_id bigint,_error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $failure$
BEGIN
  PERFORM public.website_inventory_require_service();
  UPDATE public.website_inventory_outbox
    SET attempt_count=attempt_count+1,last_error=left(coalesce(_error,'publication failed'),500),last_attempt_at=now()
    WHERE business_id=_business_id AND id=_event_id AND published_at IS NULL;
END $failure$;

CREATE FUNCTION public.ack_website_inventory_outbox(_business_id uuid, _through_id bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected integer;
BEGIN
  PERFORM public.website_inventory_require_service();
  IF _through_id<0 THEN RAISE EXCEPTION 'Invalid outbox cursor'; END IF;
  UPDATE public.website_inventory_outbox SET published_at=now(),last_error=NULL
    WHERE business_id=_business_id AND id<=_through_id AND published_at IS NULL;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected;
END $$;

REVOKE ALL ON FUNCTION public.reserve_website_inventory(uuid,uuid,uuid,text,jsonb),
  public.finalize_website_inventory(uuid,uuid,text,text),
  public.read_website_inventory_outbox(uuid,bigint,integer),
  public.ack_website_inventory_outbox(uuid,bigint),
  public.website_inventory_status(uuid,uuid),
  public.website_inventory_branch(uuid),
  public.record_website_inventory_outbox_failure(uuid,bigint,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_website_inventory(uuid,uuid,uuid,text,jsonb),
  public.finalize_website_inventory(uuid,uuid,text,text),
  public.read_website_inventory_outbox(uuid,bigint,integer),
  public.ack_website_inventory_outbox(uuid,bigint),
  public.website_inventory_status(uuid,uuid),
  public.website_inventory_branch(uuid),
  public.record_website_inventory_outbox_failure(uuid,bigint,text)
  TO service_role;

-- Preserve website movements in stock reports. Patch count functions only when
-- those optional functions exist in the target database; the current live schema
-- does not contain them, so the original draft 0107 would fail unnecessarily.
DO $website_ledger_patch$
DECLARE
  body text;
  marker text;
  replacement text;
  function_name text;
BEGIN
  IF to_regprocedure('public.create_inventory_count_session(uuid,uuid,date,text,jsonb)') IS NOT NULL THEN
    function_name := 'public.create_inventory_count_session(uuid,uuid,date,text,jsonb)';
    SELECT pg_get_functiondef(function_name::regprocedure) INTO body;
    marker := '      UNION ALL
      SELECT cm.quantity AS qty FROM public.commerce_stock_movements cm
       WHERE cm.business_id = _business_id AND cm.branch_id = _branch_id AND cm.variant_id = _variant_id';
    replacement := marker || '
      UNION ALL
      SELECT wm.quantity AS qty FROM public.website_inventory_movements wm
       WHERE wm.business_id = _business_id AND wm.branch_id = _branch_id AND wm.variant_id = _variant_id';
    IF position(marker IN body)=0 THEN RAISE EXCEPTION 'Could not extend inventory count creation snapshot'; END IF;
    EXECUTE replace(body,marker,replacement);
  END IF;

  IF to_regprocedure('public.update_inventory_count_session(uuid,date,text,jsonb)') IS NOT NULL THEN
    function_name := 'public.update_inventory_count_session(uuid,date,text,jsonb)';
    SELECT pg_get_functiondef(function_name::regprocedure) INTO body;
    marker := '        UNION ALL
        SELECT cm.quantity AS qty FROM public.commerce_stock_movements cm
         WHERE cm.business_id=_s.business_id AND cm.branch_id=_s.branch_id AND cm.variant_id=_variant_id';
    replacement := marker || '
        UNION ALL
        SELECT wm.quantity AS qty FROM public.website_inventory_movements wm
         WHERE wm.business_id=_s.business_id AND wm.branch_id=_s.branch_id AND wm.variant_id=_variant_id';
    IF position(marker IN body)=0 THEN RAISE EXCEPTION 'Could not extend inventory count edit snapshot'; END IF;
    EXECUTE replace(body,marker,replacement);
  END IF;

  SELECT pg_get_functiondef('public.read_business_report_snapshot(uuid,uuid,date)'::regprocedure) INTO body;
  marker := ' UNION ALL
 SELECT id,business_id,branch_id,variant_id,quantity::text,kind,reference,reason,actor_id,created_at,(created_at AT TIME ZONE zone)::date,document_id::text,''document''::text FROM public.commerce_stock_movements WHERE business_id=_business_id AND (_branch_id IS NULL OR branch_id=_branch_id) AND (created_at AT TIME ZONE zone)::date<=_through';
  replacement := marker || '
 UNION ALL
 SELECT id,business_id,branch_id,variant_id,quantity::text,''website_sale''::text,reference,(''Website reservation ''||reservation_id::text),NULL::uuid,created_at,(created_at AT TIME ZONE zone)::date,reservation_id::text,''website''::text FROM public.website_inventory_movements WHERE business_id=_business_id AND (_branch_id IS NULL OR branch_id=_branch_id) AND (created_at AT TIME ZONE zone)::date<=_through';
  IF position(marker IN body)=0 THEN RAISE EXCEPTION 'Could not extend business stock report snapshot'; END IF;
  EXECUTE replace(body,marker,replacement);
END
$website_ledger_patch$;

COMMENT ON TABLE public.website_inventory_reservations IS
  'Transactional website order reservations. Reserved stock reduces available quantity but not on-hand until commit. No automatic expiry.';
COMMENT ON TABLE public.website_inventory_movements IS
  'Append-only committed website sale quantity movements included in commerce_stock_balance; not a financial sale or tax posting.';

-- Accepted returns for committed Auraluxe website sales.
-- Append-only positive inventory ledger; no refund/accounting posting is implied.

CREATE TABLE public.website_inventory_returns (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  reference text NOT NULL CHECK (length(btrim(reference)) BETWEEN 1 AND 160),
  request jsonb NOT NULL CHECK (jsonb_typeof(request)='array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,id),
  FOREIGN KEY (business_id,reservation_id)
    REFERENCES public.website_inventory_reservations(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,branch_id)
    REFERENCES public.branches(business_id,id) ON DELETE RESTRICT
);
CREATE INDEX website_inventory_returns_reservation
  ON public.website_inventory_returns(business_id,reservation_id,created_at);
REVOKE ALL ON public.website_inventory_returns FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.website_inventory_returns TO service_role;
ALTER TABLE public.website_inventory_returns ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.website_inventory_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  return_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  sku text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
  restock_quantity integer NOT NULL CHECK (restock_quantity BETWEEN 0 AND quantity),
  UNIQUE (return_id,variant_id),
  FOREIGN KEY (business_id,return_id)
    REFERENCES public.website_inventory_returns(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,reservation_id)
    REFERENCES public.website_inventory_reservations(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,variant_id)
    REFERENCES public.product_variants(business_id,id) ON DELETE RESTRICT
);
CREATE INDEX website_inventory_return_items_sold
  ON public.website_inventory_return_items(business_id,reservation_id,variant_id);
REVOKE ALL ON public.website_inventory_return_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.website_inventory_return_items TO service_role;
ALTER TABLE public.website_inventory_return_items ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER website_inventory_returns_immutable
  BEFORE UPDATE OR DELETE ON public.website_inventory_returns
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER website_inventory_returns_audit
  AFTER INSERT ON public.website_inventory_returns
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER website_inventory_return_items_immutable
  BEFORE UPDATE OR DELETE ON public.website_inventory_return_items
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER website_inventory_return_items_audit
  AFTER INSERT ON public.website_inventory_return_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

CREATE TABLE public.website_inventory_return_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  return_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  sku text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
  reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_id,variant_id),
  FOREIGN KEY (business_id,return_id)
    REFERENCES public.website_inventory_returns(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,branch_id)
    REFERENCES public.branches(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,variant_id)
    REFERENCES public.product_variants(business_id,id) ON DELETE RESTRICT
);
CREATE INDEX website_inventory_return_movements_balance
  ON public.website_inventory_return_movements(business_id,branch_id,variant_id);
REVOKE ALL ON public.website_inventory_return_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.website_inventory_return_movements TO authenticated;
GRANT ALL ON public.website_inventory_return_movements TO service_role;
ALTER TABLE public.website_inventory_return_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY website_inventory_return_movements_read ON public.website_inventory_return_movements
  FOR SELECT TO authenticated
  USING (public.can_access_branch(business_id,branch_id) AND public.has_permission(business_id,'inventory.view'));
CREATE TRIGGER website_inventory_return_movements_immutable
  BEFORE UPDATE OR DELETE ON public.website_inventory_return_movements
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER website_inventory_return_movements_audit
  AFTER INSERT ON public.website_inventory_return_movements
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

ALTER TABLE public.website_inventory_outbox
  DROP CONSTRAINT website_inventory_outbox_event_type_check;
ALTER TABLE public.website_inventory_outbox
  ADD CONSTRAINT website_inventory_outbox_event_type_check
  CHECK (event_type IN ('reserved','committed','cancelled','returned'));

CREATE OR REPLACE FUNCTION public.commerce_stock_balance(_business uuid,_branch uuid,_variant uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    coalesce((SELECT sum(quantity) FROM public.stock_movements WHERE business_id=_business AND branch_id=_branch AND variant_id=_variant),0)
    + coalesce((SELECT sum(quantity) FROM public.commerce_stock_movements WHERE business_id=_business AND branch_id=_branch AND variant_id=_variant),0)
    + coalesce((SELECT sum(quantity) FROM public.website_inventory_movements WHERE business_id=_business AND branch_id=_branch AND variant_id=_variant),0)
    + coalesce((SELECT sum(quantity) FROM public.website_inventory_return_movements WHERE business_id=_business AND branch_id=_branch AND variant_id=_variant),0);
$$;
REVOKE ALL ON FUNCTION public.commerce_stock_balance(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_stock_balance(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.accept_website_inventory_return(
  _business_id uuid,
  _return_id uuid,
  _reservation_id uuid,
  _reference text,
  _items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  reservation public.website_inventory_reservations;
  existing public.website_inventory_returns;
  row_item jsonb;
  normalized_sku text;
  qty integer;
  restock_qty integer;
  matched_variant uuid;
  sold_qty integer;
  already_returned integer;
  normalized_items jsonb := '[]'::jsonb;
  result_items jsonb := '[]'::jsonb;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role'
     AND (auth.uid() IS NULL OR NOT public.has_business_role(_business_id,'admin')
       OR NOT public.has_permission(_business_id,'inventory.edit')) THEN
    RAISE EXCEPTION 'Website return administrator authorization required';
  END IF;
  IF _business_id IS NULL OR _return_id IS NULL OR _reservation_id IS NULL
     OR coalesce(length(btrim(_reference)),0) NOT BETWEEN 1 AND 160
     OR _items IS NULL OR jsonb_typeof(_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(_items) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Invalid website return request';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,0));
  SELECT * INTO reservation
    FROM public.website_inventory_reservations
   WHERE business_id=_business_id AND id=_reservation_id
   FOR UPDATE;
  IF NOT FOUND OR reservation.status<>'committed' THEN
    RAISE EXCEPTION 'Return requires an original committed website sale';
  END IF;
  IF coalesce(auth.role(),'') <> 'service_role'
     AND NOT public.can_access_branch(_business_id,reservation.branch_id) THEN
    RAISE EXCEPTION 'Website return branch access required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) x
     GROUP BY lower(btrim(x->>'sku')) HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'Duplicate return SKU lines must be combined';
  END IF;

  FOR row_item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    normalized_sku := lower(btrim(row_item->>'sku'));
    IF normalized_sku IS NULL OR normalized_sku='' OR length(normalized_sku)>80
       OR (row_item->>'quantity') IS NULL
       OR (row_item->>'quantity') !~ '^[1-9][0-9]{0,6}$' THEN
      RAISE EXCEPTION 'Invalid return SKU or quantity';
    END IF;
    qty := (row_item->>'quantity')::integer;
    IF (row_item->>'restockQuantity') IS NULL OR (row_item->>'restockQuantity') !~ '^(0|[1-9][0-9]{0,6})$' THEN
      RAISE EXCEPTION 'Invalid return restock quantity';
    END IF;
    restock_qty := (row_item->>'restockQuantity')::integer;
    IF restock_qty > qty THEN RAISE EXCEPTION 'Restock quantity cannot exceed returned quantity'; END IF;
    SELECT ri.variant_id,ri.quantity INTO matched_variant,sold_qty
      FROM public.website_inventory_reservation_items ri
     WHERE ri.business_id=_business_id AND ri.reservation_id=_reservation_id
       AND lower(btrim(ri.sku))=normalized_sku;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Return SKU was not part of the original sale';
    END IF;
    normalized_items := normalized_items || jsonb_build_array(
      jsonb_build_object('sku',normalized_sku,'quantity',qty,'restockQuantity',restock_qty,'variantId',matched_variant)
    );
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY value->>'sku'),'[]'::jsonb)
    INTO normalized_items FROM jsonb_array_elements(normalized_items);

  SELECT * INTO existing
    FROM public.website_inventory_returns
   WHERE business_id=_business_id AND id=_return_id
   FOR UPDATE;
  IF FOUND THEN
    IF existing.reservation_id=_reservation_id
       AND existing.reference=btrim(_reference)
       AND existing.request=normalized_items THEN
      RETURN jsonb_build_object('returnId',_return_id,'reservationId',_reservation_id,'status','accepted','duplicate',true);
    END IF;
    RAISE EXCEPTION 'Return operation identifier already used with different input';
  END IF;

  FOR row_item IN SELECT value FROM jsonb_array_elements(normalized_items) LOOP
    matched_variant := (row_item->>'variantId')::uuid;
    qty := (row_item->>'quantity')::integer;
    SELECT ri.quantity INTO sold_qty
      FROM public.website_inventory_reservation_items ri
     WHERE ri.business_id=_business_id AND ri.reservation_id=_reservation_id
       AND ri.variant_id=matched_variant;
    SELECT coalesce(sum(i.quantity),0) INTO already_returned
      FROM public.website_inventory_return_items i
     WHERE i.business_id=_business_id AND i.reservation_id=_reservation_id
       AND i.variant_id=matched_variant;
    IF already_returned + qty > sold_qty THEN
      RAISE EXCEPTION 'Accepted return quantity exceeds original sold quantity for SKU %',row_item->>'sku';
    END IF;
  END LOOP;

  INSERT INTO public.website_inventory_returns(id,business_id,branch_id,reservation_id,reference,request)
    VALUES(_return_id,_business_id,reservation.branch_id,_reservation_id,btrim(_reference),normalized_items);

  FOR row_item IN SELECT value FROM jsonb_array_elements(normalized_items) LOOP
    matched_variant := (row_item->>'variantId')::uuid;
    qty := (row_item->>'quantity')::integer;
    INSERT INTO public.website_inventory_return_items(
      business_id,return_id,reservation_id,variant_id,sku,quantity,restock_quantity
    ) VALUES (
      _business_id,_return_id,_reservation_id,matched_variant,row_item->>'sku',qty,(row_item->>'restockQuantity')::integer
    );
    IF (row_item->>'restockQuantity')::integer > 0 THEN
      INSERT INTO public.website_inventory_return_movements(
        business_id,branch_id,return_id,variant_id,sku,quantity,reference
      ) VALUES (
        _business_id,reservation.branch_id,_return_id,matched_variant,row_item->>'sku',(row_item->>'restockQuantity')::integer,btrim(_reference)
      );
    END IF;
    SELECT ri.quantity INTO sold_qty
      FROM public.website_inventory_reservation_items ri
     WHERE ri.business_id=_business_id AND ri.reservation_id=_reservation_id
       AND ri.variant_id=matched_variant;
    SELECT coalesce(sum(i.quantity),0) INTO already_returned
      FROM public.website_inventory_return_items i
     WHERE i.business_id=_business_id AND i.reservation_id=_reservation_id
       AND i.variant_id=matched_variant;
    result_items := result_items || jsonb_build_array(jsonb_build_object(
      'sku',row_item->>'sku',
      'quantity',qty,
      'restockQuantity',(row_item->>'restockQuantity')::integer,
      'onHand',public.commerce_stock_balance(_business_id,reservation.branch_id,matched_variant),
      'reserved',coalesce((
        SELECT sum(i.quantity)
          FROM public.website_inventory_reservation_items i
          JOIN public.website_inventory_reservations r
            ON r.business_id=i.business_id AND r.id=i.reservation_id
         WHERE i.business_id=_business_id AND i.variant_id=matched_variant
           AND r.branch_id=reservation.branch_id AND r.status='reserved'
      ),0),
      'available',public.commerce_stock_balance(_business_id,reservation.branch_id,matched_variant)-coalesce((
        SELECT sum(i.quantity)
          FROM public.website_inventory_reservation_items i
          JOIN public.website_inventory_reservations r
            ON r.business_id=i.business_id AND r.id=i.reservation_id
         WHERE i.business_id=_business_id AND i.variant_id=matched_variant
           AND r.branch_id=reservation.branch_id AND r.status='reserved'
      ),0),
      'returnedTotal',already_returned,
      'soldQuantity',sold_qty
    ));
  END LOOP;

  INSERT INTO public.website_inventory_outbox(business_id,branch_id,reservation_id,event_type,payload)
    VALUES(_business_id,reservation.branch_id,_reservation_id,'returned',
      jsonb_build_object('returnId',_return_id,'operationId',_return_id,'reservationId',_reservation_id,'reference',btrim(_reference),'items',result_items));

  RETURN jsonb_build_object(
    'returnId',_return_id,'reservationId',_reservation_id,
    'status','accepted','duplicate',false,'items',result_items
  );

END $$;

REVOKE ALL ON FUNCTION public.accept_website_inventory_return(uuid,uuid,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_website_inventory_return(uuid,uuid,uuid,text,jsonb)
  TO service_role;

-- Include accepted return movements in count snapshots only when those optional
-- functions exist, and always include them in the existing business report.
DO $website_return_ledger_patch$
DECLARE
  body text;
  marker text;
  replacement text;
BEGIN
  IF to_regprocedure('public.create_inventory_count_session(uuid,uuid,date,text,jsonb)') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.create_inventory_count_session(uuid,uuid,date,text,jsonb)'::regprocedure) INTO body;
    marker := '      UNION ALL
      SELECT wm.quantity AS qty FROM public.website_inventory_movements wm
       WHERE wm.business_id = _business_id AND wm.branch_id = _branch_id AND wm.variant_id = _variant_id';
    replacement := marker || '
      UNION ALL
      SELECT wrm.quantity AS qty FROM public.website_inventory_return_movements wrm
       WHERE wrm.business_id = _business_id AND wrm.branch_id = _branch_id AND wrm.variant_id = _variant_id';
    IF position(marker IN body)=0 THEN RAISE EXCEPTION 'Could not extend inventory count creation snapshot for accepted returns'; END IF;
    EXECUTE replace(body,marker,replacement);
  END IF;

  IF to_regprocedure('public.update_inventory_count_session(uuid,date,text,jsonb)') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.update_inventory_count_session(uuid,date,text,jsonb)'::regprocedure) INTO body;
    marker := '        UNION ALL
        SELECT wm.quantity AS qty FROM public.website_inventory_movements wm
         WHERE wm.business_id=_s.business_id AND wm.branch_id=_s.branch_id AND wm.variant_id=_variant_id';
    replacement := marker || '
        UNION ALL
        SELECT wrm.quantity AS qty FROM public.website_inventory_return_movements wrm
         WHERE wrm.business_id=_s.business_id AND wrm.branch_id=_s.branch_id AND wrm.variant_id=_variant_id';
    IF position(marker IN body)=0 THEN RAISE EXCEPTION 'Could not extend inventory count edit snapshot for accepted returns'; END IF;
    EXECUTE replace(body,marker,replacement);
  END IF;

  SELECT pg_get_functiondef('public.read_business_report_snapshot(uuid,uuid,date)'::regprocedure) INTO body;
  marker := ' UNION ALL
 SELECT id,business_id,branch_id,variant_id,quantity::text,''website_sale''::text,reference,(''Website reservation ''||reservation_id::text),NULL::uuid,created_at,(created_at AT TIME ZONE zone)::date,reservation_id::text,''website''::text FROM public.website_inventory_movements WHERE business_id=_business_id AND (_branch_id IS NULL OR branch_id=_branch_id) AND (created_at AT TIME ZONE zone)::date<=_through';
  replacement := marker || '
 UNION ALL
 SELECT id,business_id,branch_id,variant_id,quantity::text,''website_return''::text,reference,(''Website accepted return ''||return_id::text),NULL::uuid,created_at,(created_at AT TIME ZONE zone)::date,return_id::text,''website_return''::text FROM public.website_inventory_return_movements WHERE business_id=_business_id AND (_branch_id IS NULL OR branch_id=_branch_id) AND (created_at AT TIME ZONE zone)::date<=_through';
  IF position(marker IN body)=0 THEN RAISE EXCEPTION 'Could not extend business stock report snapshot for accepted returns'; END IF;
  EXECUTE replace(body,marker,replacement);
END
$website_return_ledger_patch$;

COMMENT ON TABLE public.website_inventory_returns IS
  'Accepted returns against committed website sales. Acceptance restores inventory once; it does not issue a refund or accounting voucher.';
COMMENT ON TABLE public.website_inventory_return_movements IS
  'Append-only positive stock ledger for accepted website returns, included in on-hand balance and inventory reports.';

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
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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


-- Administrator-controlled, disabled-by-default binding and operational recovery.
CREATE FUNCTION public.configure_website_inventory_binding(_business_id uuid, _branch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_business_role(_business_id,'admin')
     OR NOT public.has_permission(_business_id,'inventory.edit')
     OR NOT public.can_access_branch(_business_id,_branch_id) THEN
    RAISE EXCEPTION 'Website inventory administrator access required';
  END IF;
  IF EXISTS(SELECT 1 FROM public.website_inventory_integrations WHERE business_id=_business_id AND enabled) THEN
    RAISE EXCEPTION 'An active integration cannot be rebound through this disabled-binding workflow';
  END IF;
  INSERT INTO public.website_inventory_integrations(business_id,branch_id,enabled)
    VALUES(_business_id,_branch_id,false)
    ON CONFLICT(business_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,enabled=false,updated_at=now();
  PERFORM public.write_audit(_business_id,'website_inventory.bind_disabled','website_inventory_integrations',_business_id::text,NULL,
    jsonb_build_object('branch_id',_branch_id,'enabled',false));
  RETURN jsonb_build_object('businessId',_business_id,'branchId',_branch_id,'enabled',false);
END $$;
REVOKE ALL ON FUNCTION public.configure_website_inventory_binding(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.configure_website_inventory_binding(uuid,uuid) TO authenticated,service_role;

CREATE FUNCTION public.accept_website_inventory_return_admin(
  _business_id uuid, _return_id uuid, _reservation_id uuid, _reference text, _items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_business_role(_business_id,'admin')
     OR NOT public.has_permission(_business_id,'inventory.edit') THEN
    RAISE EXCEPTION 'Website return administrator access required';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.website_inventory_reservations r
    WHERE r.business_id=_business_id AND r.id=_reservation_id AND r.status='committed'
      AND public.can_access_branch(r.business_id,r.branch_id)
  ) THEN RAISE EXCEPTION 'Committed website sale not found in an authorized branch'; END IF;
  RETURN public.accept_website_inventory_return(_business_id,_return_id,_reservation_id,_reference,_items);
END $$;
REVOKE ALL ON FUNCTION public.accept_website_inventory_return_admin(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_website_inventory_return_admin(uuid,uuid,uuid,text,jsonb) TO authenticated,service_role;

CREATE FUNCTION public.retry_website_inventory_outbox_event(_business_id uuid, _event_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE event public.website_inventory_outbox;
BEGIN
  SELECT * INTO event FROM public.website_inventory_outbox
    WHERE business_id=_business_id AND id=_event_id AND published_at IS NULL FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.has_business_role(_business_id,'admin')
     OR NOT public.has_permission(_business_id,'inventory.edit')
     OR NOT public.can_access_branch(event.business_id,event.branch_id) THEN
    RAISE EXCEPTION 'Website outbox administrator access required';
  END IF;
  UPDATE public.website_inventory_outbox
    SET attempt_count=0,next_attempt_at=now(),dead_lettered_at=NULL,lease_token=NULL,lease_until=NULL,last_attempt_at=NULL
    WHERE business_id=_business_id AND id=_event_id;
  PERFORM public.write_audit(_business_id,'website_inventory.outbox_retry','website_inventory_outbox',_event_id::text,NULL,
    jsonb_build_object('reservation_id',event.reservation_id,'previous_attempts',event.attempt_count,'previous_error',event.last_error));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.retry_website_inventory_outbox_event(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retry_website_inventory_outbox_event(uuid,bigint) TO authenticated,service_role;

CREATE FUNCTION public.read_website_inventory_operations(_business_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE integration jsonb; reservations jsonb; events jsonb; returns jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_business_role(_business_id,'admin')
     OR NOT public.has_permission(_business_id,'inventory.view') THEN
    RAISE EXCEPTION 'Website inventory administrator access required';
  END IF;
  SELECT to_jsonb(i) INTO integration FROM public.website_inventory_integrations i WHERE business_id=_business_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'branchId',r.branch_id,'reference',r.reference,'status',r.status,'createdAt',r.created_at,
    'finalizedAt',r.finalized_at,'finalizationReference',r.finalization_reference,
    'items',(SELECT jsonb_agg(jsonb_build_object('variantId',i.variant_id,'sku',i.sku,'quantity',i.quantity) ORDER BY i.sku)
      FROM public.website_inventory_reservation_items i WHERE i.business_id=r.business_id AND i.reservation_id=r.id)
  ) ORDER BY r.created_at DESC),'[]'::jsonb) INTO reservations
    FROM (SELECT * FROM public.website_inventory_reservations WHERE business_id=_business_id ORDER BY created_at DESC LIMIT 100) r;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'reservationId',o.reservation_id,'eventType',o.event_type,'payload',o.payload,'createdAt',o.created_at,
    'publishedAt',o.published_at,'attemptCount',o.attempt_count,'lastError',o.last_error,'lastAttemptAt',o.last_attempt_at,
    'nextAttemptAt',o.next_attempt_at,'deadLetteredAt',o.dead_lettered_at
  ) ORDER BY o.id DESC),'[]'::jsonb) INTO events
    FROM (SELECT * FROM public.website_inventory_outbox WHERE business_id=_business_id ORDER BY id DESC LIMIT 100) o;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'reservationId',r.reservation_id,'reference',r.reference,'createdAt',r.created_at,
    'items',(SELECT jsonb_agg(jsonb_build_object('sku',i.sku,'quantity',i.quantity,'restockQuantity',i.restock_quantity) ORDER BY i.sku)
      FROM public.website_inventory_return_items i WHERE i.business_id=r.business_id AND i.return_id=r.id)
  ) ORDER BY r.created_at DESC),'[]'::jsonb) INTO returns
    FROM (SELECT * FROM public.website_inventory_returns WHERE business_id=_business_id ORDER BY created_at DESC LIMIT 100) r;
  RETURN jsonb_build_object('integration',integration,'reservations',reservations,'outbox',events,'returns',returns);
END $$;
REVOKE ALL ON FUNCTION public.read_website_inventory_operations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_website_inventory_operations(uuid) TO authenticated,service_role;

-- Native BizSathi receipts, POS postings and adjustments join the same FIFO
-- projection queue only after the integration is explicitly enabled.
ALTER TABLE public.website_inventory_outbox ALTER COLUMN reservation_id DROP NOT NULL;
ALTER TABLE public.website_inventory_outbox DROP CONSTRAINT website_inventory_outbox_event_type_check;
ALTER TABLE public.website_inventory_outbox ADD CONSTRAINT website_inventory_outbox_event_type_check
  CHECK(event_type IN ('reserved','committed','cancelled','returned','stock_projection'));

CREATE FUNCTION public.enqueue_native_website_inventory_projection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE on_hand numeric; reserved numeric; item_sku text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.business_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.website_inventory_integrations
    WHERE business_id=NEW.business_id AND branch_id=NEW.branch_id AND enabled) THEN
    RETURN NEW;
  END IF;
  SELECT sku INTO item_sku FROM public.product_variants WHERE business_id=NEW.business_id AND id=NEW.variant_id;
  on_hand:=public.commerce_stock_balance(NEW.business_id,NEW.branch_id,NEW.variant_id);
  SELECT coalesce(sum(i.quantity),0) INTO reserved
    FROM public.website_inventory_reservation_items i
    JOIN public.website_inventory_reservations r ON r.business_id=i.business_id AND r.id=i.reservation_id
    WHERE i.business_id=NEW.business_id AND i.variant_id=NEW.variant_id AND r.branch_id=NEW.branch_id AND r.status='reserved';
  INSERT INTO public.website_inventory_outbox(business_id,branch_id,reservation_id,event_type,payload)
    VALUES(NEW.business_id,NEW.branch_id,NULL,'stock_projection',jsonb_build_object(
      'operationId',TG_TABLE_NAME||':'||NEW.id::text,'reference',NEW.reference,
      'items',jsonb_build_array(jsonb_build_object('sku',item_sku,'quantity',NEW.quantity,
        'onHand',on_hand,'reserved',reserved,'available',on_hand-reserved))));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_native_website_inventory_projection() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER website_native_projection_stock
  AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.enqueue_native_website_inventory_projection();
CREATE TRIGGER website_native_projection_commerce
  AFTER INSERT ON public.commerce_stock_movements FOR EACH ROW EXECUTE FUNCTION public.enqueue_native_website_inventory_projection();

COMMENT ON TABLE public.website_inventory_integrations IS
  'Auraluxe fulfilment binding. No row is seeded; the admin workflow can bind Nepalgunj while enabled remains false.';
