-- 0085: map legacy parties writes to the canonical customer/supplier permission codes.
-- Canonicalize the legacy parties table to the current customer/supplier permissions.
CREATE OR REPLACE FUNCTION public.enforce_member_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $canonical_member_permission$
DECLARE
  area text := TG_ARGV[0];
  k text;
  action text := CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'edit' END;
BEGIN
  IF TG_TABLE_NAME='parties' THEN
    area := CASE WHEN NEW.kind='customer' THEN 'customers' ELSE 'suppliers' END;
  ELSIF area='commerce' THEN
    k := NEW.kind;
  ELSIF area='payment' THEN
    SELECT kind INTO k FROM public.commerce_documents WHERE id=NEW.document_id;
  ELSIF area IN ('settings','staff') THEN
    action := 'edit';
  END IF;
  IF k IS NOT NULL THEN
    area := CASE WHEN k IN ('sale','sale_return') THEN 'sales' ELSE 'purchases' END;
  END IF;
  IF NOT public.has_permission(NEW.business_id,area||'.'||action) THEN
    RAISE EXCEPTION 'Permission denied: % %',action,area;
  END IF;
  RETURN NEW;
END;
$canonical_member_permission$;
REVOKE ALL ON FUNCTION public.enforce_member_permission() FROM PUBLIC,anon,authenticated;
