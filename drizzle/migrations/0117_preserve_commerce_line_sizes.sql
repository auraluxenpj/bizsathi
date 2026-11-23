-- 0117: preserve SKU-level size allocations on commerce document lines.
-- A SKU remains the inventory identity; sizeBreakdown is descriptive allocation only.
-- Aggregate quantity continues to drive the existing stock ledger.
CREATE OR REPLACE FUNCTION public.preserve_commerce_line_sizes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  line jsonb;
  request_line jsonb;
  enriched jsonb := '[]'::jsonb;
  allocation jsonb;
  source_line jsonb;
  source_allocation jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_size text;
  v_qty numeric;
  v_sum numeric;
  v_source_qty numeric;
  v_returned numeric;
  v_existing numeric;
BEGIN
  IF jsonb_typeof(NEW.request->'lines') IS DISTINCT FROM 'array'
     OR jsonb_typeof(NEW.lines) IS DISTINCT FROM 'array' THEN
    RETURN NEW;
  END IF;

  FOR line IN SELECT value FROM jsonb_array_elements(NEW.lines) LOOP
    v_variant_id := (line->>'variantId')::uuid;
    SELECT value INTO request_line
      FROM jsonb_array_elements(NEW.request->'lines')
     WHERE value->>'variantId' = v_variant_id::text;

    IF request_line IS NULL OR request_line->'sizeBreakdown' IS NULL THEN
      enriched := enriched || jsonb_build_array(line);
      CONTINUE;
    END IF;

    IF jsonb_typeof(request_line->'sizeBreakdown') <> 'array'
       OR jsonb_array_length(request_line->'sizeBreakdown') = 0 THEN
      RAISE EXCEPTION 'Choose a size and quantity for every size-enabled SKU';
    END IF;

    SELECT product_id INTO v_product_id
      FROM public.product_variants
     WHERE business_id=NEW.business_id AND id=v_variant_id;
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Size allocation SKU was not found';
    END IF;

    v_sum := 0;
    FOR allocation IN SELECT value FROM jsonb_array_elements(request_line->'sizeBreakdown') LOOP
      v_size := nullif(btrim(allocation->>'size'),'');
      v_qty := nullif(allocation->>'quantity','')::numeric;
      IF v_size IS NULL OR v_qty IS NULL OR v_qty <= 0
         OR v_qty <> round(v_qty,3)
         OR v_qty::text IN ('NaN','Infinity','-Infinity')
         OR (SELECT count(*) FROM jsonb_array_elements(request_line->'sizeBreakdown') a
              WHERE lower(btrim(a->>'size'))=lower(v_size)) <> 1
         OR NOT EXISTS (
           SELECT 1 FROM public.products p
            WHERE p.business_id=NEW.business_id AND p.id=v_product_id
              AND EXISTS (SELECT 1 FROM unnest(p.catalogue_sizes) s WHERE lower(btrim(s))=lower(v_size))
         ) THEN
        RAISE EXCEPTION 'Invalid size allocation for SKU %', line->>'sku';
      END IF;
      v_sum := v_sum + v_qty;
    END LOOP;

    IF v_sum <> (line->>'quantity')::numeric THEN
      RAISE EXCEPTION 'Size quantities must add up to the SKU line quantity';
    END IF;

    IF NEW.kind IN ('sale_return','purchase_return') THEN
      SELECT value INTO source_line
        FROM public.commerce_documents d
        CROSS JOIN LATERAL jsonb_array_elements(d.lines)
       WHERE d.business_id=NEW.business_id AND d.id=NEW.source_id
         AND value->>'variantId'=v_variant_id::text;

      IF source_line IS NULL OR jsonb_typeof(source_line->'sizeBreakdown') <> 'array' THEN
        RAISE EXCEPTION 'Original invoice does not contain size allocations';
      END IF;

      FOR allocation IN SELECT value FROM jsonb_array_elements(request_line->'sizeBreakdown') LOOP
        v_size := allocation->>'size';
        v_qty := (allocation->>'quantity')::numeric;
        SELECT coalesce(sum((a->>'quantity')::numeric),0) INTO v_source_qty
          FROM jsonb_array_elements(source_line->'sizeBreakdown') a
         WHERE lower(btrim(a->>'size'))=lower(btrim(v_size));

        SELECT coalesce(sum((a->>'quantity')::numeric),0) INTO v_returned
          FROM public.commerce_documents d
          CROSS JOIN LATERAL jsonb_array_elements(d.lines) l
          CROSS JOIN LATERAL jsonb_array_elements(coalesce(l->'sizeBreakdown','[]'::jsonb)) a
         WHERE d.business_id=NEW.business_id AND d.source_id=NEW.source_id
           AND d.kind=NEW.kind AND d.status='confirmed'
           AND l->>'variantId'=v_variant_id::text
           AND lower(btrim(a->>'size'))=lower(btrim(v_size));

        IF v_qty + v_returned > v_source_qty THEN
          RAISE EXCEPTION 'Return quantity exceeds the remaining quantity for size %', v_size;
        END IF;
      END LOOP;
    END IF;

    enriched := enriched || jsonb_build_array(line || jsonb_build_object('sizeBreakdown',request_line->'sizeBreakdown'));
  END LOOP;

  NEW.lines := enriched;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.preserve_commerce_line_sizes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS commerce_line_size_preservation ON public.commerce_documents;
CREATE TRIGGER commerce_line_size_preservation
BEFORE INSERT ON public.commerce_documents
FOR EACH ROW EXECUTE FUNCTION public.preserve_commerce_line_sizes();

COMMENT ON FUNCTION public.preserve_commerce_line_sizes() IS
'Preserves validated per-size quantities inside each SKU invoice line. Stock movements remain SKU-level and use the aggregate line quantity.';
