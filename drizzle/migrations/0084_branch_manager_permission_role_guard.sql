-- 0084: ensure branch-manager permission ceiling follows assigned access roles, not HR title.
CREATE OR REPLACE FUNCTION public.has_permission(_business uuid,_perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $multi_role_permission$
  SELECT auth.uid() IS NULL
    OR public.platform_owner_check(auth.uid())
    OR (
      COALESCE(public.business_role_rank(_business,auth.uid()),0)>0
      AND NOT EXISTS (
        SELECT 1 FROM public.member_permission_denials d
        WHERE d.business_id=_business AND d.user_id=auth.uid() AND d.permission=_perm
      )
      AND EXISTS (
        SELECT 1
        FROM public.business_member_access_roles a
        JOIN public.business_access_roles r
          ON r.business_id=a.business_id AND r.id=a.role_id AND r.is_active
        JOIN public.business_access_role_permissions rp
          ON rp.business_id=a.business_id AND rp.role_id=a.role_id
        WHERE a.business_id=_business AND a.user_id=auth.uid()
          AND rp.permission=_perm
      )
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.business_member_access_roles a
          JOIN public.business_access_roles r
            ON r.business_id=a.business_id AND r.id=a.role_id AND r.is_active
          WHERE a.business_id=_business AND a.user_id=auth.uid()
            AND r.code IN ('position_branch_manager','legacy_branch_manager')
        )
        OR COALESCE(public.business_role_rank(_business,auth.uid()),0)>50
        OR _perm = ANY (ARRAY[
          'sales.view','expenses.view','inventory.view','categories.view',
          'stock.create','stock.edit','customers.view','suppliers.view','staff.view',
          'reports.view','reports.home_stats','reports.expenses','reports.items','reports.parties','reports.transactions'
        ]::text[])
      )
    )
$multi_role_permission$;
REVOKE ALL ON FUNCTION public.has_permission(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid,text) TO authenticated;
