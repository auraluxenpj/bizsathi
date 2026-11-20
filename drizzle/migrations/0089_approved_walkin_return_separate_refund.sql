-- 0089: allow approved sale-return requests to settle walk-in refunds as a separate payment.
-- Direct walk-in sale returns still require the immediate refund contract. The
-- manager-approved request workflow explicitly posts the return first and records
-- the refund through post_commerce_payment afterwards.
CREATE OR REPLACE FUNCTION public.guard_return_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  original public.commerce_documents;
  paid numeric;
  returned numeric;
  refunds numeric;
BEGIN
  IF NEW.kind IN ('sale_return','purchase_return') AND NEW.status='confirmed' THEN
    SELECT * INTO original
    FROM public.commerce_documents
    WHERE id=NEW.source_id AND business_id=NEW.business_id;

    SELECT coalesce(sum(amount),0) INTO paid
    FROM public.commerce_payments
    WHERE document_id=original.id AND business_id=NEW.business_id;

    SELECT coalesce(sum(total),0) INTO returned
    FROM public.commerce_documents
    WHERE source_id=original.id AND business_id=NEW.business_id
      AND kind=NEW.kind AND status='confirmed';

    SELECT coalesce(sum(p.amount),0) INTO refunds
    FROM public.commerce_payments p
    JOIN public.commerce_documents d ON d.id=p.document_id
    WHERE d.source_id=original.id AND d.business_id=NEW.business_id
      AND d.kind=NEW.kind;

    IF original.party_id IS NULL
       AND NOT (
         NEW.kind='sale_return'
         AND EXISTS (
           SELECT 1
           FROM public.sale_return_requests r
           WHERE r.business_id=NEW.business_id
             AND r.return_document_id=NEW.id
             AND r.status='approved'
         )
       )
       AND refunds<>greatest(0,paid-(original.total-returned)) THEN
      RAISE EXCEPTION 'Walk-in return requires full immediate refund';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.guard_return_settlement() FROM PUBLIC,anon,authenticated;
