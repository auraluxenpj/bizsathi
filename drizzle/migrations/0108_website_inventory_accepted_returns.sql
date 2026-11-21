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
  PERFORM public.website_inventory_require_service();
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
      jsonb_build_object('returnId',_return_id,'operationId',_reservation_id,'reference',btrim(_reference),'items',result_items));

  RETURN jsonb_build_object(
    'returnId',_return_id,'reservationId',_reservation_id,
    'status','accepted','duplicate',false,'items',result_items
  );
END $$;

REVOKE ALL ON FUNCTION public.accept_website_inventory_return(uuid,uuid,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_website_inventory_return(uuid,uuid,uuid,text,jsonb)
  TO service_role;

-- Include accepted return movements in inventory-count snapshots and business stock reports.
DO $website_return_ledger_patch$
DECLARE
  body text;
  marker text;
  replacement text;
BEGIN
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
 THEN
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
      jsonb_build_object('sku',normalized_sku,'quantity',qty,'variantId',matched_variant)
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
      business_id,return_id,reservation_id,variant_id,sku,quantity
    ) VALUES (
      _business_id,_return_id,_reservation_id,matched_variant,row_item->>'sku',qty
    );
    INSERT INTO public.website_inventory_return_movements(
      business_id,branch_id,return_id,variant_id,sku,quantity,reference
    ) VALUES (
      _business_id,reservation.branch_id,_return_id,matched_variant,row_item->>'sku',qty,btrim(_reference)
    );
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
      jsonb_build_object('returnId',_return_id,'operationId',_reservation_id,'reference',btrim(_reference),'items',result_items));

  RETURN jsonb_build_object(
    'returnId',_return_id,'reservationId',_reservation_id,
    'status','accepted','duplicate',false,'items',result_items
  );
END $$;

REVOKE ALL ON FUNCTION public.accept_website_inventory_return(uuid,uuid,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_website_inventory_return(uuid,uuid,uuid,text,jsonb)
  TO service_role;

-- Include accepted return movements in inventory-count snapshots and business stock reports.
DO $website_return_ledger_patch$
DECLARE
  body text;
  marker text;
  replacement text;
BEGIN
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
