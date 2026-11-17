-- 0089: allow Branch Managers to initiate sale returns, matching the existing workflow.
DELETE FROM public.job_title_denials
WHERE job_title='branch_manager' AND permission='sales.create';

DELETE FROM public.business_access_role_permissions rp
USING public.business_access_roles r
WHERE rp.business_id=r.business_id AND rp.role_id=r.id
  AND r.code IN ('legacy_branch_manager','position_branch_manager');

DO $refresh_branch_manager_sales$
DECLARE b record;
BEGIN
  FOR b IN SELECT id FROM public.businesses WHERE archived_at IS NULL LOOP
    PERFORM public.seed_business_access_roles(b.id);
  END LOOP;
END
$refresh_branch_manager_sales$;
