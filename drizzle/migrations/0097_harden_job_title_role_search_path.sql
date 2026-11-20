-- 0097: pin the immutable job-title mapper's search_path.
-- This function only maps input text to a role name; no dynamic object lookup is needed.
ALTER FUNCTION public.job_title_role(text)
  SET search_path = pg_catalog, public;
