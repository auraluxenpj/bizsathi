-- 0106: shared branch cash counter.
-- Additive and ledger-preserving: historical events and payment rows are not rewritten.
-- All opens still pass through the existing business advisory lock, which serializes
-- concurrent counter writes before the active-branch check.

-- Do not silently choose between multiple legacy open sessions in one branch.
DO $shared_counter_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.cash_counter_events opening
    WHERE opening.kind='open'
      AND NOT EXISTS (
        SELECT 1 FROM public.cash_counter_events closing
        WHERE closing.business_id=opening.business_id
          AND closing.branch_id=opening.branch_id
          AND closing.session_id=opening.session_id
          AND closing.kind='close'
      )
    GROUP BY opening.business_id,opening.branch_id
    HAVING count(DISTINCT opening.session_id)>1
  ) THEN
    RAISE EXCEPTION 'Resolve multiple active cash counter sessions in a branch before enabling shared counters';
  END IF;
END;
$shared_counter_preflight$;

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
      OR public.can_approve_inventory_count(_business_id,_branch_id)
      OR (
        (public.has_business_access_role(_business_id,'position_sales_person')
         OR public.has_business_access_role(_business_id,'legacy_staff'))
        AND public.has_permission(_business_id,'sales.view')
        AND EXISTS (
          SELECT 1 FROM public.cash_counter_events opening
          WHERE opening.business_id=_business_id AND opening.branch_id=_branch_id
            AND opening.session_id=_session_id AND opening.kind='open'
            AND (
              opening.actor_id=auth.uid()
              OR NOT EXISTS (
                SELECT 1 FROM public.cash_counter_events closing
                WHERE closing.business_id=_business_id AND closing.branch_id=_branch_id
                  AND closing.session_id=_session_id AND closing.kind='close'
              )
            )
        )
      )
    )
$cash_counter_read$;
REVOKE ALL ON FUNCTION public.can_read_cash_counter_session(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_cash_counter_session(uuid,uuid,uuid) TO authenticated,service_role;

-- Preserve the existing role-based guards; branch managers may operate the shared counter.
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
       AND NOT public.has_business_role(NEW.business_id,'admin')
       AND NOT (
         public.has_business_access_role(NEW.business_id,'position_sales_person')
         OR public.has_business_access_role(NEW.business_id,'legacy_staff')
         OR public.can_approve_inventory_count(NEW.business_id,NEW.branch_id)
       ) THEN
      RAISE EXCEPTION 'Cash counter access requires an assigned cashier or branch manager access role';
    END IF;
  END IF;
  RETURN NEW;
END;
$cashier_access_guard$;
REVOKE ALL ON FUNCTION public.guard_cashier_job_title_writes() FROM PUBLIC,anon,authenticated;

-- One active counter per branch. The existing business advisory lock makes this
-- check atomic across concurrent opens; a close ends the active session.
CREATE OR REPLACE FUNCTION public.post_cash_counter_event(_request jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $post_cash_counter_event$
#variable_conflict use_column
DECLARE
  b uuid:=(_request->>'businessId')::uuid;
  i uuid:=(_request->>'id')::uuid;
  br uuid:=(_request->>'branchId')::uuid;
  per uuid:=(_request->>'periodId')::uuid;
  session uuid:=(_request->>'sessionId')::uuid;
  k text:=_request->>'kind';
  amount numeric:=(_request->>'amount')::numeric;
  dt date:=(_request->>'date')::date;
  old public.cash_counter_events;
  expected numeric;
  delta numeric;
  can_manage boolean;
BEGIN
  IF NOT public.can_access_branch(b,br) OR NOT (
    public.has_business_role(b,'admin')
    OR public.has_business_role(b,'accountant')
    OR public.can_approve_inventory_count(b,br)
    OR (
      (public.has_business_access_role(b,'position_sales_person')
       OR public.has_business_access_role(b,'legacy_staff'))
      AND public.has_permission(b,'sales.create')
    )
  ) THEN
    RAISE EXCEPTION 'Counter access denied';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(b::text,0));
  SELECT * INTO old FROM public.cash_counter_events WHERE id=i;
  IF FOUND THEN
    IF old.business_id=b AND old.actor_id=auth.uid() AND old.request=_request THEN RETURN i; END IF;
    RAISE EXCEPTION 'Request identifier conflict';
  END IF;

  PERFORM public.commerce_open_period(b,per,dt);
  IF k NOT IN ('open','in','out','close')
     OR amount IS NULL OR amount<0 OR amount<>round(amount,2)
     OR amount::text IN ('NaN','Infinity','-Infinity')
     OR coalesce(length(btrim(_request->>'reference')),0) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid counter event';
  END IF;

  can_manage :=
    public.has_business_role(b,'admin')
    OR public.has_business_role(b,'accountant')
    OR public.can_approve_inventory_count(b,br);

  IF k='open' THEN
    IF EXISTS (
      SELECT 1 FROM public.cash_counter_events o
      WHERE o.business_id=b AND o.branch_id=br AND o.kind='open'
        AND NOT EXISTS (
          SELECT 1 FROM public.cash_counter_events c
          WHERE c.business_id=b AND c.branch_id=br
            AND c.session_id=o.session_id AND c.kind='close'
        )
    ) THEN
      RAISE EXCEPTION 'This branch already has an open cash counter';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.cash_counter_events o
      WHERE o.business_id=b AND o.branch_id=br AND o.session_id=session AND o.kind='open'
    ) OR EXISTS (
      SELECT 1 FROM public.cash_counter_events c
      WHERE c.business_id=b AND c.branch_id=br AND c.session_id=session AND c.kind='close'
    ) THEN
      RAISE EXCEPTION 'Your open cash counter is required';
    END IF;
  END IF;

  IF k='close' AND NOT can_manage THEN
    RAISE EXCEPTION 'Manager approval required to close the branch counter';
  END IF;
  IF k IN ('in','out') AND NOT can_manage THEN
    RAISE EXCEPTION 'Cash adjustments require administrator';
  END IF;

  SELECT coalesce(sum(CASE WHEN kind IN ('open','in') THEN amount WHEN kind='out' THEN -amount ELSE 0 END),0)
    INTO expected
  FROM public.cash_counter_events WHERE session_id=session;
  SELECT expected+coalesce(sum(CASE WHEN direction='in' THEN amount ELSE -amount END),0)
    INTO expected
  FROM public.commerce_payments WHERE session_id=session AND method='cash';

  IF k='out' AND amount>expected THEN RAISE EXCEPTION 'Cash out exceeds counter cash'; END IF;
  delta:=CASE WHEN k='close' THEN amount-expected ELSE NULL END;

  INSERT INTO public.cash_counter_events(
    id,business_id,branch_id,period_id,session_id,kind,amount,expected,difference,
    reference,actor_id,event_date,request
  ) VALUES(
    i,b,br,per,session,k,amount,CASE WHEN k='close' THEN expected ELSE NULL END,
    delta,btrim(_request->>'reference'),auth.uid(),dt,_request
  );

  IF k IN ('open','in','out') AND amount>0 THEN
    PERFORM public.commerce_journal(
      b,br,per,i,'counter',dt,'cash',
      CASE WHEN k IN ('open','in') THEN amount ELSE 0 END,
      CASE WHEN k='out' THEN amount ELSE 0 END
    );
    PERFORM public.commerce_journal(
      b,br,per,i,'counter',dt,'counter_clearing',
      CASE WHEN k='out' THEN amount ELSE 0 END,
      CASE WHEN k IN ('open','in') THEN amount ELSE 0 END
    );
  END IF;
  RETURN i;
END $post_cash_counter_event$;
REVOKE ALL ON FUNCTION public.post_cash_counter_event(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_cash_counter_event(jsonb) TO authenticated;

-- Cash payments join the open branch session, regardless of which authorised cashier
-- opened it. Payment actor_id remains auth.uid() in the original posting function.
DO $migration$
DECLARE
  body text;
  old_check text := 'IF session IS NULL OR NOT EXISTS(SELECT 1 FROM public.cash_counter_events opening WHERE opening.session_id=session AND opening.business_id=b AND opening.branch_id=d.branch_id AND opening.kind=''open'' AND (opening.actor_id=auth.uid() OR (d.kind=''sale_return'' AND public.can_approve_inventory_count(b,d.branch_id) AND EXISTS(SELECT 1 FROM public.sale_return_requests rr WHERE rr.business_id=b AND rr.return_document_id=d.id AND rr.requested_by=opening.actor_id)))) OR EXISTS(SELECT 1 FROM public.cash_counter_events WHERE session_id=session AND kind=''close'') THEN RAISE EXCEPTION ''Your open cash counter is required'';END IF;';
  new_check text := 'IF session IS NULL OR NOT EXISTS(SELECT 1 FROM public.cash_counter_events opening WHERE opening.session_id=session AND opening.business_id=b AND opening.branch_id=d.branch_id AND opening.kind=''open'') OR EXISTS(SELECT 1 FROM public.cash_counter_events closing WHERE closing.session_id=session AND closing.business_id=b AND closing.branch_id=d.branch_id AND closing.kind=''close'') OR (d.kind=''sale_return'' AND NOT EXISTS(SELECT 1 FROM public.sale_return_requests rr WHERE rr.business_id=b AND rr.return_document_id=d.id AND rr.status=''approved'' AND rr.reviewed_by=auth.uid())) THEN RAISE EXCEPTION ''Your open cash counter is required'';END IF;';
BEGIN
  SELECT pg_get_functiondef('public.post_commerce_payment(jsonb)'::regprocedure) INTO body;
  IF position(old_check IN body)=0 THEN
    RAISE EXCEPTION 'Could not safely locate the existing cash payment counter guard';
  END IF;
  body:=replace(body,old_check,new_check);
  EXECUTE body;
END;
$migration$;

-- Share cash-payment visibility only while the branch counter is open. Other cashier
-- sales and historical counter sessions remain scoped to their original actors.
DROP POLICY IF EXISTS commerce_payments_read ON public.commerce_payments;
CREATE POLICY commerce_payments_read ON public.commerce_payments
FOR SELECT TO authenticated
USING (
  public.can_access_branch(business_id,branch_id)
  AND (
    public.has_business_role(business_id,'accountant')
    OR public.is_cashier_sale_or_return(business_id,branch_id,document_id)
    OR (
      method='cash' AND session_id IS NOT NULL
      AND public.can_approve_inventory_count(commerce_payments.business_id,commerce_payments.branch_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.commerce_documents d
      JOIN public.sale_return_requests rr
        ON rr.business_id=d.business_id
       AND rr.return_document_id=d.id
      WHERE d.id=commerce_payments.document_id
        AND d.business_id=commerce_payments.business_id
        AND d.branch_id=commerce_payments.branch_id
        AND d.kind='sale_return'
        AND rr.status='approved'
        AND rr.reviewed_by=auth.uid()
        AND public.can_approve_inventory_count(commerce_payments.business_id,commerce_payments.branch_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.commerce_documents d
      WHERE d.id=commerce_payments.document_id
        AND d.business_id=commerce_payments.business_id
        AND d.branch_id=commerce_payments.branch_id
        AND (
          (d.kind IN ('sale','sale_return') AND public.has_permission(commerce_payments.business_id,'sales.view'))
          OR (d.kind IN ('purchase','purchase_return') AND public.has_permission(commerce_payments.business_id,'purchases.view'))
        )
        AND (
          public.has_business_access_role(commerce_payments.business_id,'position_entry_person')
          OR public.has_business_access_role(commerce_payments.business_id,'position_stock_manager')
          OR public.has_business_access_role(commerce_payments.business_id,'legacy_entry_person')
          OR public.has_business_access_role(commerce_payments.business_id,'legacy_stock_manager')
          OR EXISTS (
            SELECT 1 FROM public.business_memberships viewer
            WHERE viewer.business_id=commerce_payments.business_id
              AND viewer.user_id=auth.uid() AND viewer.status='active'
              AND viewer.role_code='viewer'
          )
        )
    )
  )
);
