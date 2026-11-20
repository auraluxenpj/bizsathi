-- 0090: Prevent confirmed supplier invoices from exceeding their purchase order.
-- Supports multiple partial bills and a bill resumed from a saved draft.
CREATE OR REPLACE FUNCTION public.guard_commerce_payload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _source public.commerce_documents%ROWTYPE;
  _order public.commerce_documents%ROWTYPE;
  _order_id uuid;
  _line jsonb;
  _ordered numeric;
  _already numeric;
  _incoming numeric;
BEGIN
  IF NEW.status <> 'confirmed' OR NEW.kind <> 'purchase' OR NEW.source_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _source
    FROM public.commerce_documents
   WHERE id = NEW.source_id
     AND business_id = NEW.business_id;

  IF NOT FOUND THEN
    RETURN NEW; -- The posting RPC validates source ownership and status.
  END IF;

  IF _source.kind = 'purchase_order' AND _source.status = 'confirmed' THEN
    _order_id := _source.id;
  ELSIF _source.kind = 'purchase' AND _source.status = 'draft' AND _source.source_id IS NOT NULL THEN
    _order_id := _source.source_id;
  ELSE
    RETURN NEW;
  END IF;

  SELECT * INTO _order
    FROM public.commerce_documents
   WHERE id = _order_id
     AND business_id = NEW.business_id
     AND kind = 'purchase_order'
     AND status = 'confirmed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A confirmed purchase order is required for this supplier invoice';
  END IF;

  FOR _line IN SELECT value FROM jsonb_array_elements(NEW.lines) LOOP
    SELECT (ordered.value->>'quantity')::numeric
      INTO _ordered
      FROM jsonb_array_elements(_order.lines) AS ordered(value)
     WHERE ordered.value->>'variantId' = _line->>'variantId';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase line absent from order';
    END IF;

    SELECT coalesce(sum((bill_line.value->>'quantity')::numeric), 0)
      INTO _already
      FROM public.commerce_documents bill
      CROSS JOIN LATERAL jsonb_array_elements(bill.lines) AS bill_line(value)
     WHERE bill.business_id = NEW.business_id
       AND bill.kind = 'purchase'
       AND bill.status = 'confirmed'
       AND bill.id <> NEW.id
       AND bill_line.value->>'variantId' = _line->>'variantId'
       AND (
         bill.source_id = _order_id
         OR EXISTS (
           SELECT 1
             FROM public.commerce_documents saved
            WHERE saved.id = bill.source_id
              AND saved.business_id = NEW.business_id
              AND saved.kind = 'purchase'
              AND saved.source_id = _order_id
         )
       );

    _incoming := (_line->>'quantity')::numeric;
    IF _already + _incoming > _ordered THEN
      RAISE EXCEPTION 'Supplier invoice quantity exceeds the remaining purchase order quantity';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_commerce_payload() FROM PUBLIC, anon, authenticated;
