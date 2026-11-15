-- 0044: Enforce cashier/job-title boundaries at the database layer.
-- Additive only. This migration is not applied to any live database by this PR.

CREATE OR REPLACE FUNCTION public.has_business_job_title(_business_id uuid, _job_title text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_memberships m
    WHERE m.business_id = _business_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.job_title = _job_title
  )
$$;
REVOKE ALL ON FUNCTION public.has_business_job_title(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_business_job_title(uuid,text) TO authenticated, service_role;

-- Boolean-only helper: a cashier may read their own sale and an approved return
-- that references that sale, but cannot enumerate another cashier's documents.
CREATE OR REPLACE FUNCTION public.is_cashier_sale_or_return(_business_id uuid, _branch_id uuid, _document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_business_job_title(_business_id, 'sales_person')
    AND public.has_permission(_business_id, 'sales.view')
    AND EXISTS (
      SELECT 1
      FROM public.commerce_documents d
      WHERE d.id = _document_id
        AND d.business_id = _business_id
        AND d.branch_id = _branch_id
        AND (
          (d.kind = 'sale' AND d.actor_id = auth.uid())
          OR (
            d.kind = 'sale_return'
            AND EXISTS (
              SELECT 1
              FROM public.commerce_documents original
              WHERE original.id = d.source_id
                AND original.business_id = _business_id
                AND original.branch_id = _branch_id
                AND original.kind = 'sale'
                AND original.actor_id = auth.uid()
            )
          )
        )
    )
$$;
REVOKE ALL ON FUNCTION public.is_cashier_sale_or_return(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_cashier_sale_or_return(uuid,uuid,uuid) TO authenticated, service_role;

-- Cashiers can see all events in their own drawer session, including a manager's
-- adjustment event, but not other staff sessions. Accountants/managers retain branch reports.
CREATE OR REPLACE FUNCTION public.can_read_cash_counter_session(_business_id uuid, _branch_id uuid, _session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_access_branch(_business_id, _branch_id)
    AND (
      public.has_business_role(_business_id, 'accountant')
      OR (
        public.has_business_job_title(_business_id, 'sales_person')
        AND public.has_permission(_business_id, 'sales.view')
        AND EXISTS (
          SELECT 1
          FROM public.cash_counter_events opening
          WHERE opening.business_id = _business_id
            AND opening.branch_id = _branch_id
            AND opening.session_id = _session_id
            AND opening.kind = 'open'
            AND opening.actor_id = auth.uid()
        )
      )
    )
$$;
REVOKE ALL ON FUNCTION public.can_read_cash_counter_session(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_cash_counter_session(uuid,uuid,uuid) TO authenticated, service_role;

-- Branch membership alone is not permission to read every financial transaction.
DROP POLICY IF EXISTS commerce_documents_read ON public.commerce_documents;
CREATE POLICY commerce_documents_read ON public.commerce_documents
FOR SELECT TO authenticated
USING (
  public.can_access_branch(business_id, branch_id)
  AND (
    public.has_business_role(business_id, 'accountant')
    OR public.is_cashier_sale_or_return(business_id, branch_id, id)
    OR (
      (
        public.has_business_job_title(business_id, 'entry_person')
        OR public.has_business_job_title(business_id, 'stock_manager')
        OR EXISTS (
          SELECT 1 FROM public.business_memberships viewer
          WHERE viewer.business_id = commerce_documents.business_id
            AND viewer.user_id = auth.uid()
            AND viewer.status = 'active'
            AND viewer.role_code = 'viewer'
        )
      )
      AND (
        (kind IN ('sale', 'sale_return') AND public.has_permission(business_id, 'sales.view'))
        OR (kind IN ('purchase', 'purchase_return', 'purchase_order', 'goods_receipt')
            AND public.has_permission(business_id, 'purchases.view'))
      )
    )
  )
);

DROP POLICY IF EXISTS commerce_payments_read ON public.commerce_payments;
CREATE POLICY commerce_payments_read ON public.commerce_payments
FOR SELECT TO authenticated
USING (
  public.can_access_branch(business_id, branch_id)
  AND (
    public.has_business_role(business_id, 'accountant')
    OR public.is_cashier_sale_or_return(business_id, branch_id, document_id)
    OR EXISTS (
      SELECT 1
      FROM public.commerce_documents d
      WHERE d.id = commerce_payments.document_id
        AND d.business_id = commerce_payments.business_id
        AND d.branch_id = commerce_payments.branch_id
        AND (
          (d.kind IN ('sale', 'sale_return') AND public.has_permission(business_id, 'sales.view'))
          OR (d.kind IN ('purchase', 'purchase_return') AND public.has_permission(business_id, 'purchases.view'))
        )
        AND (
          public.has_business_job_title(business_id, 'entry_person')
          OR public.has_business_job_title(business_id, 'stock_manager')
          OR EXISTS (
            SELECT 1 FROM public.business_memberships viewer
            WHERE viewer.business_id = commerce_payments.business_id
              AND viewer.user_id = auth.uid()
              AND viewer.status = 'active'
              AND viewer.role_code = 'viewer'
          )
        )
    )
  )
);

DROP POLICY IF EXISTS cash_events_read ON public.cash_counter_events;
CREATE POLICY cash_events_read ON public.cash_counter_events
FOR SELECT TO authenticated
USING (public.can_read_cash_counter_session(business_id, branch_id, session_id));

DROP POLICY IF EXISTS commerce_journal_read ON public.commerce_journal_entries;
CREATE POLICY commerce_journal_read ON public.commerce_journal_entries
FOR SELECT TO authenticated
USING (
  public.can_access_branch(business_id, branch_id)
  AND public.has_business_role(business_id, 'accountant')
);

DROP POLICY IF EXISTS loyalty_events_read ON public.loyalty_point_events;
CREATE POLICY loyalty_events_read ON public.loyalty_point_events
FOR SELECT TO authenticated
USING (
  public.can_access_branch(business_id, branch_id)
  AND NOT public.has_business_job_title(business_id, 'sales_person')
  AND (
    public.has_business_role(business_id, 'accountant')
    OR (
      public.has_permission(business_id, 'customers.view')
      AND (
        public.has_business_job_title(business_id, 'entry_person')
        OR EXISTS (
          SELECT 1 FROM public.business_memberships viewer
          WHERE viewer.business_id = loyalty_point_events.business_id
            AND viewer.user_id = auth.uid()
            AND viewer.status = 'active'
            AND viewer.role_code = 'viewer'
        )
      )
    )
  )
);

DROP POLICY IF EXISTS loyalty_redemptions_read ON public.loyalty_redemptions;
CREATE POLICY loyalty_redemptions_read ON public.loyalty_redemptions
FOR SELECT TO authenticated
USING (
  public.can_access_branch(business_id, branch_id)
  AND NOT public.has_business_job_title(business_id, 'sales_person')
  AND (
    public.has_business_role(business_id, 'accountant')
    OR (
      public.has_permission(business_id, 'customers.view')
      AND (
        public.has_business_job_title(business_id, 'entry_person')
        OR EXISTS (
          SELECT 1 FROM public.business_memberships viewer
          WHERE viewer.business_id = loyalty_redemptions.business_id
            AND viewer.user_id = auth.uid()
            AND viewer.status = 'active'
            AND viewer.role_code = 'viewer'
        )
      )
    )
  )
);

DROP POLICY IF EXISTS customer_memberships_read ON public.customer_memberships;
CREATE POLICY customer_memberships_read ON public.customer_memberships
FOR SELECT TO authenticated
USING (
  public.is_business_member(business_id)
  AND NOT public.has_business_job_title(business_id, 'sales_person')
  AND (
    public.has_business_role(business_id, 'accountant')
    OR (
      public.has_permission(business_id, 'customers.view')
      AND (
        public.has_business_job_title(business_id, 'entry_person')
        OR EXISTS (
          SELECT 1 FROM public.business_memberships viewer
          WHERE viewer.business_id = customer_memberships.business_id
            AND viewer.user_id = auth.uid()
            AND viewer.status = 'active'
            AND viewer.role_code = 'viewer'
        )
      )
    )
  )
);

-- The POS uses this one-customer balance RPC instead of reading the full loyalty ledger.
CREATE OR REPLACE FUNCTION public.loyalty_available_points(_business uuid, _mobile text)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n text := public.normalize_member_mobile(_mobile);
  m uuid;
BEGIN
  IF NOT public.has_business_role(_business, 'accountant')
     AND NOT (
       public.has_permission(_business, 'customers.view')
       AND (
         public.has_business_job_title(_business, 'sales_person')
         OR public.has_business_job_title(_business, 'entry_person')
       )
     ) THEN
    RAISE EXCEPTION 'Loyalty access denied';
  END IF;
  IF n IS NULL THEN RETURN 0; END IF;
  SELECT id INTO m
  FROM public.customer_memberships
  WHERE business_id = _business AND mobile = n;
  IF m IS NULL THEN RETURN 0; END IF;
  RETURN public.loyalty_balance(_business, m);
END
$$;
REVOKE ALL ON FUNCTION public.loyalty_available_points(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loyalty_available_points(uuid,text) TO authenticated, service_role;

-- A SECURITY DEFINER posting RPC must not let any generic staff member act as a cashier.
CREATE OR REPLACE FUNCTION public.guard_cashier_job_title_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  document_kind text;
BEGIN
  IF TG_TABLE_NAME = 'commerce_documents' THEN
    IF NEW.kind = 'sale'
       AND NOT public.has_business_role(NEW.business_id, 'accountant')
       AND NOT (
         public.has_permission(NEW.business_id, 'sales.create')
         AND (
           public.has_business_job_title(NEW.business_id, 'sales_person')
           OR public.has_business_job_title(NEW.business_id, 'entry_person')
         )
       ) THEN
      RAISE EXCEPTION 'Sales access requires the Sales Person job title';
    END IF;
  ELSIF TG_TABLE_NAME = 'commerce_payments' THEN
    SELECT d.kind INTO document_kind
    FROM public.commerce_documents d
    WHERE d.id = NEW.document_id AND d.business_id = NEW.business_id;
    IF document_kind = 'sale'
       AND NOT public.has_business_role(NEW.business_id, 'accountant')
       AND NOT (
         public.has_permission(NEW.business_id, 'sales.create')
         AND (
           public.has_business_job_title(NEW.business_id, 'sales_person')
           OR public.has_business_job_title(NEW.business_id, 'entry_person')
         )
       ) THEN
      RAISE EXCEPTION 'Sales payment access requires the Sales Person job title';
    END IF;
  ELSIF TG_TABLE_NAME = 'cash_counter_events' THEN
    IF NOT public.has_business_role(NEW.business_id, 'accountant')
       AND NOT public.has_business_job_title(NEW.business_id, 'sales_person') THEN
      RAISE EXCEPTION 'Cash counter access requires the Sales Person job title';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.guard_cashier_job_title_writes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS commerce_document_cashier_title_guard ON public.commerce_documents;
CREATE TRIGGER commerce_document_cashier_title_guard
BEFORE INSERT ON public.commerce_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_cashier_job_title_writes();

DROP TRIGGER IF EXISTS commerce_payment_cashier_title_guard ON public.commerce_payments;
CREATE TRIGGER commerce_payment_cashier_title_guard
BEFORE INSERT ON public.commerce_payments
FOR EACH ROW EXECUTE FUNCTION public.guard_cashier_job_title_writes();

DROP TRIGGER IF EXISTS cash_counter_cashier_title_guard ON public.cash_counter_events;
CREATE TRIGGER cash_counter_cashier_title_guard
BEFORE INSERT ON public.cash_counter_events
FOR EACH ROW EXECUTE FUNCTION public.guard_cashier_job_title_writes();
