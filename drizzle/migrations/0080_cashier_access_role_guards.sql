-- 0080: remove remaining operational authorization dependencies on HR job titles.
-- Operational cashier permissions are access-role based, not HR-title based.
CREATE OR REPLACE FUNCTION public.can_read_cash_counter_session(_business_id uuid,_branch_id uuid,_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $cash_counter_read$
  SELECT public.can_access_branch(_business_id,_branch_id)
    AND (
      public.has_business_role(_business_id,'accountant')
      OR (
        (public.has_business_access_role(_business_id,'position_branch_manager')
         OR public.has_business_access_role(_business_id,'legacy_branch_manager'))
        AND public.has_permission(_business_id,'sales.view')
      )
      OR (
        (public.has_business_access_role(_business_id,'position_sales_person')
         OR public.has_business_access_role(_business_id,'legacy_staff'))
        AND public.has_permission(_business_id,'sales.view')
        AND EXISTS (
          SELECT 1 FROM public.cash_counter_events opening
          WHERE opening.business_id=_business_id AND opening.branch_id=_branch_id
            AND opening.session_id=_session_id AND opening.kind='open'
            AND opening.actor_id=auth.uid()
        )
      )
    )
$cash_counter_read$;
REVOKE ALL ON FUNCTION public.can_read_cash_counter_session(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_cash_counter_session(uuid,uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_cashier_job_title_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $cashier_access_guard$
DECLARE
  document_kind text;
  has_sales_role boolean;
BEGIN
  has_sales_role :=
    public.has_business_access_role(NEW.business_id,'position_sales_person')
    OR public.has_business_access_role(NEW.business_id,'position_entry_person')
    OR public.has_business_access_role(NEW.business_id,'legacy_staff');

  IF TG_TABLE_NAME='commerce_documents' THEN
    IF NEW.kind='sale'
       AND NOT public.has_business_role(NEW.business_id,'accountant')
       AND NOT (public.has_permission(NEW.business_id,'sales.create') AND has_sales_role) THEN
      RAISE EXCEPTION 'Sales access requires an assigned Sales Person or Store Team access role';
    END IF;
  ELSIF TG_TABLE_NAME='commerce_payments' THEN
    SELECT d.kind INTO document_kind
    FROM public.commerce_documents d
    WHERE d.id=NEW.document_id AND d.business_id=NEW.business_id;
    IF document_kind='sale'
       AND NOT public.has_business_role(NEW.business_id,'accountant')
       AND NOT (public.has_permission(NEW.business_id,'sales.create') AND has_sales_role) THEN
      RAISE EXCEPTION 'Sales payment access requires an assigned Sales Person or Store Team access role';
    END IF;
  ELSIF TG_TABLE_NAME='cash_counter_events' THEN
    IF NOT public.has_business_role(NEW.business_id,'accountant')
       AND NOT (
         public.has_business_access_role(NEW.business_id,'position_sales_person')
         OR public.has_business_access_role(NEW.business_id,'legacy_staff')
       ) THEN
      RAISE EXCEPTION 'Cash counter access requires an assigned Sales Person access role';
    END IF;
  END IF;
  RETURN NEW;
END;
$cashier_access_guard$;
REVOKE ALL ON FUNCTION public.guard_cashier_job_title_writes() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.is_cashier_sale_or_return(_business_id uuid,_branch_id uuid,_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $cashier_sale_return$
  SELECT (
      public.has_business_access_role(_business_id,'position_sales_person')
      OR public.has_business_access_role(_business_id,'legacy_staff')
    )
    AND public.has_permission(_business_id,'sales.view')
    AND EXISTS (
      SELECT 1
      FROM public.commerce_documents d
      WHERE d.id=_document_id AND d.business_id=_business_id
        AND d.branch_id=_branch_id
        AND (
          (d.kind='sale' AND d.actor_id=auth.uid())
          OR (
            d.kind='sale_return' AND d.status='confirmed'
            AND EXISTS (
              SELECT 1 FROM public.commerce_documents original
              WHERE original.id=d.source_id AND original.business_id=_business_id
                AND original.branch_id=_branch_id AND original.kind='sale'
                AND original.status='confirmed' AND original.actor_id=auth.uid()
            )
          )
        )
    )
$cashier_sale_return$;
REVOKE ALL ON FUNCTION public.is_cashier_sale_or_return(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_cashier_sale_or_return(uuid,uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.loyalty_available_points(_business uuid,_mobile text)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $loyalty_access$
DECLARE
  n text := public.normalize_member_mobile(_mobile);
  m uuid;
  has_sales_role boolean;
BEGIN
  has_sales_role :=
    public.has_business_access_role(_business,'position_sales_person')
    OR public.has_business_access_role(_business,'position_entry_person')
    OR public.has_business_access_role(_business,'legacy_staff');
  IF NOT public.has_business_role(_business,'accountant')
     AND NOT (public.has_permission(_business,'customers.view') AND has_sales_role) THEN
    RAISE EXCEPTION 'Loyalty access denied';
  END IF;
  IF n IS NULL THEN RETURN 0; END IF;
  SELECT id INTO m FROM public.customer_memberships
  WHERE business_id=_business AND mobile=n;
  IF m IS NULL THEN RETURN 0; END IF;
  RETURN public.loyalty_balance(_business,m);
END;
$loyalty_access$;
REVOKE ALL ON FUNCTION public.loyalty_available_points(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.loyalty_available_points(uuid,text) TO authenticated,service_role;

