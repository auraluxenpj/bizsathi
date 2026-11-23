-- 0120: Persist catalogue order independently of insertion IDs and SKU updates.
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS catalogue_serial integer;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY business_id ORDER BY created_at, id
  )::integer AS serial
  FROM public.product_variants
  WHERE catalogue_serial IS NULL
)
UPDATE public.product_variants AS pv
SET catalogue_serial = ranked.serial
FROM ranked
WHERE pv.id = ranked.id;

ALTER TABLE public.product_variants
  ALTER COLUMN catalogue_serial SET NOT NULL;

ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_catalogue_serial_positive
  CHECK (catalogue_serial > 0);

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_business_catalogue_serial_key
  ON public.product_variants (business_id, catalogue_serial);

CREATE OR REPLACE FUNCTION public.assign_product_catalogue_serial()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Serial numbers are permanent identifiers: edits and SKU re-syncs cannot renumber.
    NEW.catalogue_serial := OLD.catalogue_serial;
    RETURN NEW;
  END IF;

  -- Serialize allocation per business so concurrent inserts cannot claim the same number.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.business_id::text, 0));
  SELECT coalesce(max(pv.catalogue_serial), 0) + 1
    INTO NEW.catalogue_serial
  FROM public.product_variants AS pv
  WHERE pv.business_id = NEW.business_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_variants_assign_catalogue_serial ON public.product_variants;
CREATE TRIGGER product_variants_assign_catalogue_serial
BEFORE INSERT OR UPDATE ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION public.assign_product_catalogue_serial();

COMMENT ON COLUMN public.product_variants.catalogue_serial IS
  'Immutable per-business catalogue sequence; assigned in import order for new SKUs and never changed on re-sync.';
