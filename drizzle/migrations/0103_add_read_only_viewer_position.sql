-- 0103: make the existing read-only Viewer access profile selectable as a position bundle.
CREATE OR REPLACE FUNCTION public.job_title_role(_title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE _title
    WHEN 'partner' THEN 'admin'
    WHEN 'manager' THEN 'accountant'
    WHEN 'branch_manager' THEN 'branch_manager'
    WHEN 'accountant' THEN 'accountant'
    WHEN 'department_manager' THEN 'staff'
    WHEN 'sales_person' THEN 'staff'
    WHEN 'stock_manager' THEN 'staff'
    WHEN 'entry_person' THEN 'staff'
    WHEN 'viewer' THEN 'viewer'
  END
$function$;

WITH business AS (
  SELECT id FROM public.businesses WHERE name = 'AURALUXE' AND archived_at IS NULL
)
INSERT INTO public.business_access_roles
  (business_id, code, name, description, authority_rank, is_system, is_active)
SELECT id, 'position_viewer', 'Read-only Viewer',
       'Read-only access to approved business information. No create, edit, delete, approval or settings actions.',
       1, true, true
FROM business
ON CONFLICT (business_id, code)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  authority_rank = 1,
  is_system = true,
  is_active = true,
  updated_at = now();

DELETE FROM public.business_access_role_permissions rp
WHERE rp.business_id = (SELECT id FROM public.businesses WHERE name = 'AURALUXE' AND archived_at IS NULL)
  AND rp.role_id = (
    SELECT r.id FROM public.business_access_roles r
    WHERE r.business_id = rp.business_id AND r.code = 'position_viewer'
  );

INSERT INTO public.business_access_role_permissions (business_id, role_id, permission)
SELECT b.id, viewer.id, legacy_permission.permission
FROM public.businesses b
JOIN public.business_access_roles viewer
  ON viewer.business_id = b.id AND viewer.code = 'position_viewer'
JOIN public.business_access_roles legacy
  ON legacy.business_id = b.id AND legacy.code = 'legacy_viewer'
JOIN public.business_access_role_permissions legacy_permission
  ON legacy_permission.business_id = b.id AND legacy_permission.role_id = legacy.id
WHERE b.name = 'AURALUXE' AND b.archived_at IS NULL;

DELETE FROM public.job_title_denials WHERE job_title = 'viewer';
INSERT INTO public.job_title_denials (job_title, permission)
SELECT 'viewer', c.permission
FROM public.business_permission_catalog c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.businesses b
  JOIN public.business_access_roles legacy
    ON legacy.business_id = b.id AND legacy.code = 'legacy_viewer'
  JOIN public.business_access_role_permissions rp
    ON rp.business_id = b.id AND rp.role_id = legacy.id AND rp.permission = c.permission
  WHERE b.name = 'AURALUXE' AND b.archived_at IS NULL
);

DO $patch_branch_manager_viewer_position$
DECLARE
  body text;
  old_gate text := '_title NOT IN (''department_manager'', ''sales_person'', ''stock_manager'', ''entry_person'')';
  new_gate text := '_title NOT IN (''department_manager'', ''sales_person'', ''stock_manager'', ''entry_person'', ''viewer'')';
BEGIN
  SELECT pg_get_functiondef('public.set_member_job_title(uuid,uuid,text)'::regprocedure) INTO body;
  IF position(old_gate IN body) = 0 THEN
    RAISE EXCEPTION 'Could not locate Branch Manager position allow-list';
  END IF;
  body := replace(body, old_gate, new_gate);
  EXECUTE body;
END
$patch_branch_manager_viewer_position$;
