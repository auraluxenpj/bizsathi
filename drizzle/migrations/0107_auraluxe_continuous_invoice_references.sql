-- 0107: continuous Auraluxe sales invoice references.
-- Existing documents are intentionally untouched. The first newly confirmed sale starts at 001.

CREATE TABLE public.commerce_reference_counters (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE RESTRICT,
  last_number bigint NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);
ALTER TABLE public.commerce_reference_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commerce_reference_counters FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_sale_invoice_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  next_number bigint;
BEGIN
  IF NEW.kind = 'sale' AND NEW.status = 'confirmed' THEN
    INSERT INTO public.commerce_reference_counters (business_id, last_number)
    VALUES (NEW.business_id, 1)
    ON CONFLICT (business_id)
    DO UPDATE SET last_number = public.commerce_reference_counters.last_number + 1
    RETURNING last_number INTO next_number;

    NEW.reference := 'AL-' || to_char(NEW.document_date, 'DDMMYY') || '-' || lpad(next_number::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.assign_sale_invoice_reference() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zzzz_sale_invoice_reference ON public.commerce_documents;
CREATE TRIGGER zzzz_sale_invoice_reference
BEFORE INSERT ON public.commerce_documents
FOR EACH ROW EXECUTE FUNCTION public.assign_sale_invoice_reference();

CREATE OR REPLACE FUNCTION public.sync_sale_stock_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  document_kind text;
  document_reference text;
BEGIN
  SELECT kind, reference INTO document_kind, document_reference
  FROM public.commerce_documents
  WHERE id = NEW.document_id AND business_id = NEW.business_id;

  IF document_kind = 'sale' THEN
    NEW.reference := document_reference;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.sync_sale_stock_reference() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zzzz_sale_stock_reference ON public.commerce_stock_movements;
CREATE TRIGGER zzzz_sale_stock_reference
BEFORE INSERT ON public.commerce_stock_movements
FOR EACH ROW EXECUTE FUNCTION public.sync_sale_stock_reference();

CREATE OR REPLACE FUNCTION public.sync_sale_cash_payment_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  document_kind text;
  document_reference text;
BEGIN
  IF NEW.method = 'cash' THEN
    SELECT kind, reference INTO document_kind, document_reference
    FROM public.commerce_documents
    WHERE id = NEW.document_id AND business_id = NEW.business_id;

    IF document_kind = 'sale' THEN
      NEW.reference := document_reference;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.sync_sale_cash_payment_reference() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zzzz_sale_cash_payment_reference ON public.commerce_payments;
CREATE TRIGGER zzzz_sale_cash_payment_reference
BEFORE INSERT ON public.commerce_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_sale_cash_payment_reference();
