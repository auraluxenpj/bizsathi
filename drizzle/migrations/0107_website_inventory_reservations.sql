-- Transactional website reservations for the Auraluxe integration.
-- Git-only until separately approved for production. No expiry silently releases reservations.

CREATE TABLE public.website_inventory_integrations (
  business_id uuid PRIMARY KEY,
  branch_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.website_inventory_integrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.website_inventory_integrations TO service_role;
ALTER TABLE public.website_inventory_integrations ENABLE ROW LEVEL SECURITY;

INSERT INTO public.website_inventory_integrations(business_id,branch_id,enabled)
VALUES ('c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01','4c534ce0-3ab5-46e4-8804-37cf0d72f8db',false)
ON CONFLICT (business_id) DO NOTHING;

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
    normalized_items:=normalized_items||jsonb_build_array(jsonb_build_object('sku',normalized_sku,'quantity',qty,'variantId',variant_id));
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
    WHERE business_id=_business_id AND enabled;
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
    'eventType',event_type,'payload',payload,'createdAt',created_at) ORDER BY id)
    FROM (SELECT * FROM public.website_inventory_outbox WHERE business_id=_business_id AND id>_after_id AND published_at IS NULL ORDER BY id LIMIT _limit) q),'[]'::jsonb);
END $$;

CREATE FUNCTION public.ack_website_inventory_outbox(_business_id uuid, _through_id bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE affected integer;
BEGIN
  PERFORM public.website_inventory_require_service();
  IF _through_id<0 THEN RAISE EXCEPTION 'Invalid outbox cursor'; END IF;
  UPDATE public.website_inventory_outbox SET published_at=now()
    WHERE business_id=_business_id AND id<=_through_id AND published_at IS NULL;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected;
END $$;

REVOKE ALL ON FUNCTION public.reserve_website_inventory(uuid,uuid,uuid,text,jsonb),
  public.finalize_website_inventory(uuid,uuid,text,text),
  public.read_website_inventory_outbox(uuid,bigint,integer),
  public.ack_website_inventory_outbox(uuid,bigint),
  public.website_inventory_status(uuid,uuid),
  public.website_inventory_branch(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_website_inventory(uuid,uuid,uuid,text,jsonb),
  public.finalize_website_inventory(uuid,uuid,text,text),
  public.read_website_inventory_outbox(uuid,bigint,integer),
  public.ack_website_inventory_outbox(uuid,bigint),
  public.website_inventory_status(uuid,uuid),
  public.website_inventory_branch(uuid)
  TO service_role;

-- Preserve website movements in stock reports and physical-count snapshots.
DO $website_ledger_patch$
DECLARE
  body text;
  marker text;
  replacement text;
  function_name text;
BEGIN
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

  function_name := 'public.read_business_report_snapshot(uuid,uuid,date)';
  SELECT pg_get_functiondef(function_name::regprocedure) INTO body;
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
