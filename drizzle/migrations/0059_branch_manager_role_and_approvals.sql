-- 0059: Separate branch-scoped Branch Manager authority from Accountant.
-- Additive role/catalog changes plus branch-scoped inventory approval replacements.
-- Existing memberships and branch grants are deliberately not backfilled or rewritten.
-- Apply only to an isolated database first; no production migration is authorized here.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.roles WHERE rank = 50 AND code <> 'branch_manager') THEN
    RAISE EXCEPTION 'Role rank 50 is already assigned; resolve the role catalog before adding Branch Manager';
  END IF;
END $$;

INSERT INTO public.roles(code, name, rank, description)
VALUES ('branch_manager', 'Branch Manager', 50,
        'Branch-scoped operations, delegated team invitations and branch approvals')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    rank = EXCLUDED.rank,
    description = EXCLUDED.description;

-- Keep the old "manager" title mapped to its historical Accountant role.
-- New Branch Managers use the distinct branch_manager title and role code.
ALTER TABLE public.business_memberships
  DROP CONSTRAINT IF EXISTS business_memberships_job_title_check;
ALTER TABLE public.business_memberships
  ADD CONSTRAINT business_memberships_job_title_check
  CHECK (job_title IS NULL OR job_title IN
    ('partner','manager','branch_manager','accountant','sales_person','stock_manager','entry_person'));

ALTER TABLE public.business_invitations
  DROP CONSTRAINT IF EXISTS business_invitations_job_title_check;
ALTER TABLE public.business_invitations
  ADD CONSTRAINT business_invitations_job_title_check
  CHECK (job_title IS NULL OR job_title IN
    ('partner','manager','branch_manager','accountant','sales_person','stock_manager','entry_person'));

ALTER TABLE IF EXISTS public.team_invitations
  DROP CONSTRAINT IF EXISTS team_invitations_job_title_check;
ALTER TABLE IF EXISTS public.team_invitations
  ADD CONSTRAINT team_invitations_job_title_check
  CHECK (job_title IS NULL OR job_title IN
    ('partner','manager','branch_manager','accountant','sales_person','stock_manager','entry_person'));

CREATE OR REPLACE FUNCTION public.job_title_role(_title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _title
    WHEN 'partner' THEN 'admin'
    WHEN 'manager' THEN 'accountant'
    WHEN 'branch_manager' THEN 'branch_manager'
    WHEN 'accountant' THEN 'accountant'
    WHEN 'sales_person' THEN 'staff'
    WHEN 'stock_manager' THEN 'staff'
    WHEN 'entry_person' THEN 'staff'
  END
$$;

-- Branch Manager defaults are operational and deliberately exclude purchase cost,
-- account management, business settings, destructive actions and staff role changes.
DELETE FROM public.job_title_denials WHERE job_title = 'branch_manager';
INSERT INTO public.job_title_denials(job_title, permission)
SELECT 'branch_manager', p.permission
FROM unnest(ARRAY[
  'sales.create','sales.delete','sales.edit','sales.view',
  'purchases.create','purchases.delete','purchases.edit','purchases.view',
  'expenses.create','expenses.delete','expenses.edit','expenses.view',
  'inventory.create','inventory.delete','inventory.edit','inventory.view',
  'categories.edit_delete','categories.view',
  'stock.create','stock.delete','stock.edit',
  'customers.create','customers.delete','customers.edit','customers.view',
  'suppliers.create','suppliers.delete','suppliers.edit','suppliers.view',
  'features.import','features.business_cards','features.greeting_cards',
  'staff.create','staff.delete','staff.edit','staff.view',
  'settings.edit','settings.invoice','settings.item','settings.party','settings.transaction','settings.delete_business',
  'accounts.create','accounts.adjust_create','accounts.delete','accounts.edit','accounts.adjust_edit_delete','accounts.view',
  'reports.business_status','reports.view','reports.home_stats','reports.expenses','reports.items','reports.parties','reports.transactions','reports.view',
  'notebook.create','notebook.view','notebook.delete','notebook.edit',
  'other.party_adjustments','other.purchase_price','other.change_date'
]::text[]) AS p(permission)
WHERE p.permission <> ALL (ARRAY[
  'sales.view','purchases.view','expenses.view','inventory.view','categories.view',
  'stock.create','stock.edit','customers.view','suppliers.view','staff.view',
  'reports.home_stats','reports.expenses','reports.items','reports.parties','reports.transactions'
]::text[]);


-- Fail closed if a Branch Manager security role is ever created without its matching
-- Branch Manager title. That title is what installs the restrictive permission-denial template.
CREATE OR REPLACE FUNCTION public.has_permission(_business uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT auth.uid() IS NULL OR (
    NOT EXISTS (
      SELECT 1
      FROM public.business_memberships m
      WHERE m.business_id = _business
        AND m.user_id = auth.uid()
        AND m.status = 'active'
        AND m.role_code = 'branch_manager'
        AND m.job_title IS DISTINCT FROM 'branch_manager'
    )
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.business_memberships m
        WHERE m.business_id = _business
          AND m.user_id = auth.uid()
          AND m.status = 'active'
          AND m.role_code = 'branch_manager'
      )
      OR _perm = ANY (ARRAY[
        'sales.view','purchases.view','expenses.view','inventory.view','categories.view',
        'stock.create','stock.edit','customers.view','suppliers.view','staff.view',
        'reports.view','reports.home_stats','reports.expenses','reports.items','reports.parties','reports.transactions'
      ]::text[])
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.member_permission_denials d
      WHERE d.business_id = _business
        AND d.user_id = auth.uid()
        AND d.permission = _perm
    )
  )
$function$;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_team_invitation(
  _business_id uuid, _branch_id uuid, _role text, _job_title text, _denied text[],
  _invitee_email text, _invitee_mobile text, _token_hash text, _expires_at timestamptz, _max_uses int, _label text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $invitation$
DECLARE
  actor uuid := auth.uid();
  iid uuid;
  actor_rank smallint;
  g public.delegation_grants;
  p text;
  cdef text;
  mobile text;
  invited_email text;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.team_invite_authority(actor, _business_id, _branch_id, _role) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  invited_email := lower(trim(_invitee_email));
  IF invited_email IS NULL OR length(invited_email) > 254
     OR invited_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid invitee email address';
  END IF;
  mobile := public.normalize_member_mobile(_invitee_mobile);
  IF mobile IS NULL THEN RAISE EXCEPTION 'Enter a valid Nepal mobile number'; END IF;
  IF _max_uses IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Phone-bound invitations are single-use only'; END IF;
  IF _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid invitation token';
  END IF;
  IF _expires_at IS NULL OR _expires_at < now() + interval '5 minutes'
     OR _expires_at > now() + interval '30 days' THEN
    RAISE EXCEPTION 'Expiry must be between 5 minutes and 30 days from now';
  END IF;
  IF _job_title IS NOT NULL AND public.job_title_role(_job_title) IS DISTINCT FROM _role THEN
    RAISE EXCEPTION 'Job title does not match the role';
  END IF;
  IF _role = 'branch_manager' AND _job_title IS DISTINCT FROM 'branch_manager' THEN
    RAISE EXCEPTION 'Branch Manager invitations must use the Branch Manager title';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.business_id = _business_id AND m.user_id = actor
      AND m.status = 'active' AND m.role_code = 'branch_manager'
      AND m.job_title IS DISTINCT FROM 'branch_manager'
  ) THEN
    RAISE EXCEPTION 'Branch Manager assignment is incomplete';
  END IF;

  _denied := COALESCE(_denied, '{}');
  -- The invitee must never receive permissions that the inviter has denied.
  -- Merge current member denials and the current role template inside the trusted RPC,
  -- rather than trusting the browser to submit the inviter's full restriction list.
  SELECT COALESCE(array_agg(permission ORDER BY permission), ARRAY[]::text[])
  INTO _denied
  FROM (
    SELECT unnest(_denied) AS permission
    UNION
    SELECT d.permission
    FROM public.member_permission_denials d
    WHERE d.business_id = _business_id AND d.user_id = actor
    UNION
    SELECT jd.permission
    FROM public.job_title_denials jd
    JOIN public.business_memberships m
      ON m.business_id = _business_id AND m.user_id = actor
    WHERE m.status = 'active' AND jd.job_title = m.job_title
  ) effective_denials;

  IF cardinality(_denied) > 80 THEN
    RAISE EXCEPTION 'Too many permission restrictions';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO cdef
  FROM pg_constraint
  WHERE conname = 'member_permission_denials_permission_check'
    AND conrelid = 'public.member_permission_denials'::regclass;

  FOREACH p IN ARRAY _denied LOOP
    IF cdef IS NULL OR position(quote_literal(p) IN cdef) = 0 THEN
      RAISE EXCEPTION 'Unknown permission %', p;
    END IF;
  END LOOP;

  IF NOT public.platform_owner_check(actor) THEN
    actor_rank := public.business_role_rank(_business_id, actor);
    IF actor_rank < 80 THEN
      SELECT * INTO g
      FROM public.delegation_grants
      WHERE business_id = _business_id AND branch_id = _branch_id
        AND manager_user_id = actor AND revoked_at IS NULL
        AND can_invite AND _role = ANY (allowed_role_codes)
      FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Delegation is no longer active' USING ERRCODE = '42501'; END IF;
      IF _max_uses > g.max_invite_uses
         OR _expires_at > now() + make_interval(days => g.max_invite_days) THEN
        RAISE EXCEPTION 'Exceeds your delegation limits' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.team_invitations
    (business_id, branch_id, role_code, job_title, denied_permissions, invitee_email, invitee_mobile,
     token_hash, label, invited_by, expires_at, max_uses)
  VALUES (_business_id, _branch_id, _role, _job_title, _denied, invited_email, mobile,
          _token_hash, _label, actor, _expires_at, 1)
  RETURNING id INTO iid;

  PERFORM public.write_audit(_business_id, 'team_invite.create', 'team_invitations', iid::text, NULL,
    jsonb_build_object('branch', _branch_id, 'role', _role,
      'invitee_email_domain', split_part(invited_email, '@', 2),
      'invitee_mobile_last4', right(mobile, 4), 'max_uses', 1, 'expires_at', _expires_at));
  RETURN iid;
END
$invitation$;

REVOKE ALL ON FUNCTION public.create_team_invitation(uuid, uuid, text, text, text[], text, text, text, timestamptz, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_invitation(uuid, uuid, text, text, text[], text, text, text, timestamptz, int, text) TO authenticated, service_role;

-- Branch Managers may read operational sales/purchase/payment evidence only for assigned branches.
-- They do not gain accountant journal access, business-wide access, or cashier posting authority.
CREATE OR REPLACE FUNCTION public.can_read_cash_counter_session(
  _business_id uuid, _branch_id uuid, _session_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.can_access_branch(_business_id, _branch_id)
    AND (
      public.has_business_role(_business_id, 'accountant')
      OR (
        public.has_business_job_title(_business_id, 'branch_manager')
        AND public.has_permission(_business_id, 'sales.view')
      )
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
$function$;
REVOKE ALL ON FUNCTION public.can_read_cash_counter_session(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_cash_counter_session(uuid, uuid, uuid) TO authenticated, service_role;

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
        OR public.has_business_job_title(business_id, 'branch_manager')
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
          OR public.has_business_job_title(business_id, 'branch_manager')
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

-- One database authorization predicate for the Branch Manager approval boundary.
-- Admins retain business-wide approval; Branch Managers require the exact branch grant.
CREATE OR REPLACE FUNCTION public.can_approve_inventory_count(_business_id uuid, _branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND public.can_access_branch(_business_id, _branch_id)
    AND (
      public.has_business_role(_business_id, 'admin')
      OR (
        public.has_business_job_title(_business_id, 'branch_manager')
        AND public.has_permission(_business_id, 'stock.edit')
      )
    )
$function$;
REVOKE ALL ON FUNCTION public.can_approve_inventory_count(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_approve_inventory_count(uuid, uuid) TO authenticated, service_role;

-- Approval is independent from count preparation and cannot be performed by the counter.
CREATE OR REPLACE FUNCTION public.review_inventory_count_session(
  _session_id uuid, _decision text, _note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s public.inventory_count_sessions%ROWTYPE;
BEGIN
  SELECT * INTO _s
  FROM public.inventory_count_sessions
  WHERE id = _session_id
  FOR UPDATE;

  IF NOT FOUND OR auth.uid() IS NULL
     OR NOT public.can_approve_inventory_count(_s.business_id, _s.branch_id)
     OR _s.status <> 'submitted'
     OR _s.created_by = auth.uid()
     OR _decision IS NULL
     OR _decision NOT IN ('approved','rejected')
     OR (_decision = 'rejected' AND char_length(btrim(coalesce(_note,''))) = 0)
     OR char_length(coalesce(_note,'')) > 1000 THEN
    RAISE EXCEPTION 'Only a different authorized Branch Manager or Administrator may review this branch count; rejection requires a note'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.inventory_count_sessions
  SET status = _decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = NULLIF(btrim(_note),''),
      updated_at = now()
  WHERE id = _session_id;

  PERFORM public.write_audit(
    _s.business_id,
    'inventory_count_' || _decision,
    'inventory_count_sessions',
    _session_id::text,
    jsonb_build_object('status','submitted'),
    jsonb_build_object('status',_decision,'review_note',NULLIF(btrim(_note),''))
  );
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION public.review_inventory_count_session(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_inventory_count_session(uuid, text, text) TO authenticated;

-- Branch Managers can inspect only proposals for branches currently assigned to them.
CREATE OR REPLACE FUNCTION public.read_inventory_count_adjustment(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _s public.inventory_count_sessions%ROWTYPE;
  _b public.inventory_count_adjustment_batches%ROWTYPE;
  _result jsonb;
BEGIN
  SELECT * INTO _s
  FROM public.inventory_count_sessions
  WHERE id = _session_id;

  IF NOT FOUND OR auth.uid() IS NULL
     OR NOT public.can_approve_inventory_count(_s.business_id, _s.branch_id) THEN
    RAISE EXCEPTION 'Authorized branch approval access to this inventory count is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _b
  FROM public.inventory_count_adjustment_batches
  WHERE session_id = _session_id AND business_id = _s.business_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'batch', to_jsonb(_b),
    'lines', coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'variant_id', l.variant_id,
      'sku', l.sku_snapshot,
      'product', l.product_name_snapshot,
      'system_quantity', l.system_quantity,
      'physical_quantity', l.physical_quantity,
      'delta', l.delta,
      'current_quantity_at_prepare', l.current_quantity_at_prepare,
      'stock_operation_id', l.stock_operation_id
    ) ORDER BY l.product_name_snapshot, l.sku_snapshot), '[]'::jsonb)
  )
  INTO _result
  FROM public.inventory_count_adjustment_lines l
  WHERE l.batch_id = _b.id;

  RETURN _result;
END
$$;

CREATE OR REPLACE FUNCTION public.prepare_inventory_count_adjustment(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _s public.inventory_count_sessions%ROWTYPE;
  _existing public.inventory_count_adjustment_batches%ROWTYPE;
  _batch_id uuid;
  _line record;
  _current numeric;
  _stale boolean := false;
  _line_count integer := 0;
BEGIN
  SELECT * INTO _s
  FROM public.inventory_count_sessions
  WHERE id = _session_id
  FOR UPDATE;

  IF NOT FOUND OR auth.uid() IS NULL
     OR NOT public.can_approve_inventory_count(_s.business_id, _s.branch_id)
     OR _s.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved count can be prepared by an authorized Branch Manager or Administrator'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_s.business_id::text, 0));

  SELECT * INTO _existing
  FROM public.inventory_count_adjustment_batches
  WHERE session_id = _session_id AND business_id = _s.business_id
  FOR UPDATE;

  IF FOUND THEN RETURN public.read_inventory_count_adjustment(_session_id); END IF;

  INSERT INTO public.inventory_count_adjustment_batches(
    business_id, session_id, branch_id, status, prepared_by
  ) VALUES (_s.business_id, _session_id, _s.branch_id, 'pending', auth.uid())
  RETURNING id INTO _batch_id;

  -- Staleness is checked against every entered physical count, including exact matches.
  FOR _line IN
    SELECT l.variant_id, l.system_quantity
    FROM public.inventory_count_lines l
    WHERE l.session_id = _session_id AND l.physical_quantity IS NOT NULL
    ORDER BY l.variant_id
  LOOP
    _current := public.commerce_stock_balance(_s.business_id, _s.branch_id, _line.variant_id);
    IF _current IS DISTINCT FROM _line.system_quantity THEN _stale := true; END IF;
  END LOOP;

  FOR _line IN
    SELECT l.variant_id, l.sku_snapshot, l.product_name_snapshot,
           l.system_quantity, l.physical_quantity
    FROM public.inventory_count_lines l
    WHERE l.session_id = _session_id
      AND l.physical_quantity IS NOT NULL
      AND l.physical_quantity <> l.system_quantity
    ORDER BY l.variant_id
  LOOP
    _current := public.commerce_stock_balance(_s.business_id, _s.branch_id, _line.variant_id);
    INSERT INTO public.inventory_count_adjustment_lines(
      business_id, batch_id, variant_id, sku_snapshot, product_name_snapshot,
      system_quantity, physical_quantity, delta, current_quantity_at_prepare
    ) VALUES (
      _s.business_id, _batch_id, _line.variant_id, _line.sku_snapshot, _line.product_name_snapshot,
      _line.system_quantity, _line.physical_quantity,
      _line.physical_quantity - _line.system_quantity, _current
    );
    _line_count := _line_count + 1;
  END LOOP;

  UPDATE public.inventory_count_adjustment_batches
  SET status = CASE WHEN _stale THEN 'stale' WHEN _line_count = 0 THEN 'no_adjustments' ELSE 'pending' END,
      stale_at = CASE WHEN _stale THEN now() ELSE NULL END
  WHERE id = _batch_id;

  PERFORM public.write_audit(
    _s.business_id,
    'inventory_count_adjustment_prepared',
    'inventory_count_adjustment_batches',
    _batch_id::text,
    NULL,
    jsonb_build_object(
      'session_id', _session_id,
      'line_count', _line_count,
      'status', CASE WHEN _stale THEN 'stale' WHEN _line_count = 0 THEN 'no_adjustments' ELSE 'pending' END
    )
  );

  RETURN public.read_inventory_count_adjustment(_session_id);
END
$$;

CREATE OR REPLACE FUNCTION public.confirm_inventory_count_adjustment(_session_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _s public.inventory_count_sessions%ROWTYPE;
  _b public.inventory_count_adjustment_batches%ROWTYPE;
  _line record;
  _current numeric;
  _stale boolean := false;
  _operation_id uuid;
  _reference text;
BEGIN
  IF auth.uid() IS NULL OR _reason IS NULL
     OR char_length(btrim(_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'A confirmation reason of 1 to 500 characters is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _s
  FROM public.inventory_count_sessions
  WHERE id = _session_id
  FOR UPDATE;

  IF NOT FOUND
     OR NOT public.can_approve_inventory_count(_s.business_id, _s.branch_id)
     OR _s.status <> 'approved' THEN
    RAISE EXCEPTION 'Authorized Branch Manager or Administrator access to an approved count is required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_s.business_id::text, 0));

  SELECT * INTO _b
  FROM public.inventory_count_adjustment_batches
  WHERE session_id = _session_id AND business_id = _s.business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prepare and review the proposed adjustments before confirming'
      USING ERRCODE = '22023';
  END IF;

  IF _b.status IN ('posted','no_adjustments') THEN
    RETURN public.read_inventory_count_adjustment(_session_id);
  END IF;

  IF _b.status = 'stale' THEN
    RAISE EXCEPTION 'Stock changed after the count. Start a fresh physical count before adjusting stock'
      USING ERRCODE = '40001';
  END IF;

  -- Recheck every entered physical count before posting any ledger movement.
  FOR _line IN
    SELECT l.variant_id, l.system_quantity
    FROM public.inventory_count_lines l
    WHERE l.session_id = _session_id AND l.physical_quantity IS NOT NULL
    ORDER BY l.variant_id
  LOOP
    _current := public.commerce_stock_balance(_s.business_id, _s.branch_id, _line.variant_id);
    IF _current IS DISTINCT FROM _line.system_quantity THEN
      _stale := true;
      EXIT;
    END IF;
  END LOOP;

  IF _stale THEN
    UPDATE public.inventory_count_adjustment_batches
    SET status = 'stale', stale_at = now()
    WHERE id = _b.id;

    PERFORM public.write_audit(
      _s.business_id,
      'inventory_count_adjustment_stale',
      'inventory_count_adjustment_batches',
      _b.id::text,
      jsonb_build_object('status','pending'),
      jsonb_build_object('status','stale','reason','Stock changed after the physical count')
    );

    RETURN public.read_inventory_count_adjustment(_session_id);
  END IF;

  _reference := 'Inventory count ' || left(_session_id::text, 8);

  FOR _line IN
    SELECT l.id, l.variant_id, l.delta
    FROM public.inventory_count_adjustment_lines l
    WHERE l.batch_id = _b.id
    ORDER BY l.variant_id
  LOOP
    _operation_id := gen_random_uuid();

    PERFORM public.post_stock_operation(
      _s.business_id, _operation_id, _line.variant_id, _s.branch_id, NULL,
      'adjustment', _line.delta, _reference, btrim(_reason)
    );

    UPDATE public.inventory_count_adjustment_lines
    SET stock_operation_id = _operation_id
    WHERE id = _line.id;
  END LOOP;

  UPDATE public.inventory_count_adjustment_batches
  SET status = 'posted',
      confirmed_by = auth.uid(),
      confirmed_at = now(),
      confirmation_reason = btrim(_reason)
  WHERE id = _b.id;

  PERFORM public.write_audit(
    _s.business_id,
    'inventory_count_adjustment_posted',
    'inventory_count_adjustment_batches',
    _b.id::text,
    jsonb_build_object('status','pending'),
    jsonb_build_object(
      'status','posted',
      'session_id',_session_id,
      'line_count',(SELECT count(*) FROM public.inventory_count_adjustment_lines WHERE batch_id = _b.id),
      'confirmation_reason',btrim(_reason)
    )
  );

  RETURN public.read_inventory_count_adjustment(_session_id);
END
$$;

REVOKE ALL ON FUNCTION public.read_inventory_count_adjustment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prepare_inventory_count_adjustment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_inventory_count_adjustment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_inventory_count_adjustment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_inventory_count_adjustment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_count_adjustment(uuid, text) TO authenticated;
