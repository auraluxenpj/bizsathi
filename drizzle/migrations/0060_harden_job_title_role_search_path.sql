-- 0060: Pin the search path for the immutable job-title role mapper.
-- The function references only its argument and SQL CASE expressions; pg_catalog
-- is sufficient and prevents caller-controlled schema resolution.
CREATE OR REPLACE FUNCTION public.job_title_role(_title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
  SELECT CASE _title
    WHEN 'partner' THEN 'admin'
    WHEN 'manager' THEN 'accountant'
    WHEN 'branch_manager' THEN 'branch_manager'
    WHEN 'accountant' THEN 'accountant'
    WHEN 'sales_person' THEN 'staff'
    WHEN 'stock_manager' THEN 'staff'
    WHEN 'entry_person' THEN 'staff'
  END
$function$;

-- Keep the role mapping stable and verify every supported title explicitly.
DO $test$
BEGIN
  IF public.job_title_role('partner') IS DISTINCT FROM 'admin'
     OR public.job_title_role('manager') IS DISTINCT FROM 'accountant'
     OR public.job_title_role('branch_manager') IS DISTINCT FROM 'branch_manager'
     OR public.job_title_role('accountant') IS DISTINCT FROM 'accountant'
     OR public.job_title_role('sales_person') IS DISTINCT FROM 'staff'
     OR public.job_title_role('stock_manager') IS DISTINCT FROM 'staff'
     OR public.job_title_role('entry_person') IS DISTINCT FROM 'staff'
     OR public.job_title_role(NULL) IS NOT NULL
     OR public.job_title_role('unknown') IS NOT NULL THEN
    RAISE EXCEPTION 'job_title_role mapping regression';
  END IF;
END
$test$;
