-- 0060: Align cashier and Branch Manager access with the approved role workflow.
-- Git-only proposal: apply to an isolated database and review before any production migration.

-- Branch Managers may use POS and review/create authorized sale returns in assigned branches.
DELETE FROM public.job_title_denials
WHERE job_title = 'branch_manager' AND permission = 'sales.create';

-- Cashiers retain the minimum product/category/customer read access needed by POS and CRM.
-- They do not receive stock management, expense entry, general reporting or notebook tools.
INSERT INTO public.job_title_denials(job_title, permission)
SELECT 'sales_person', p.permission
FROM unnest(ARRAY[
  'expenses.create','expenses.delete','expenses.edit','expenses.view',
  'inventory.create','inventory.delete','inventory.edit',
  'reports.home_stats',
  'notebook.create','notebook.view','notebook.delete','notebook.edit',
  'features.business_cards','features.greeting_cards'
]::text[]) AS p(permission)
ON CONFLICT (job_title, permission) DO NOTHING;

-- Extend the Branch Manager's fixed permission ceiling to include POS sale creation.
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
        'sales.create','sales.view','expenses.view','inventory.view','categories.view',
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

-- Enforce the cashier return restriction at the database boundary, not only in the UI.
-- A cashier can view sale returns but cannot insert a return document or refund payment.
CREATE OR REPLACE FUNCTION public.enforce_member_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  area text := TG_ARGV[0];
  k text;
  action text := CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'edit' END;
BEGIN
  IF area = 'commerce' THEN
    k := NEW.kind;
  ELSIF area = 'payment' THEN
    SELECT kind INTO k
    FROM public.commerce_documents
    WHERE id = NEW.document_id;
  END IF;

  IF k = 'sale_return' AND EXISTS (
    SELECT 1
    FROM public.business_memberships m
    WHERE m.business_id = NEW.business_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role_code = 'staff'
      AND m.job_title = 'sales_person'
  ) THEN
    RAISE EXCEPTION 'Cashiers cannot post sale returns or refunds directly; ask a Branch Manager to process the return'
      USING ERRCODE = '42501';
  END IF;

  IF k IS NOT NULL THEN
    area := CASE WHEN k IN ('sale', 'sale_return') THEN 'sales' ELSE 'purchases' END;
  END IF;

  IF NOT public.has_permission(NEW.business_id, area || '.' || action) THEN
    RAISE EXCEPTION 'Permission denied: % %', action, area
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.enforce_member_permission() FROM PUBLIC, anon, authenticated;
