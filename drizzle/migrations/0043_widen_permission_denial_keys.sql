-- 0043: Allow every permission key used by job-title defaults (job_title_denials) in member_permission_denials.
-- Idempotent and ADDITIVE: keeps every key already allowed and only adds missing ones. Safe if production is already wide.
DO $$
DECLARE cdef text; keys text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint
   WHERE conname = 'member_permission_denials_permission_check' AND conrelid = 'public.member_permission_denials'::regclass;
  SELECT string_agg(DISTINCT quote_literal(k), ',') INTO keys FROM (
    SELECT (regexp_matches(COALESCE(cdef, ''), '''([a-z_.]+)''', 'g'))[1] AS k
    UNION SELECT permission FROM public.job_title_denials
  ) s;
  ALTER TABLE public.member_permission_denials DROP CONSTRAINT IF EXISTS member_permission_denials_permission_check;
  EXECUTE 'ALTER TABLE public.member_permission_denials ADD CONSTRAINT member_permission_denials_permission_check CHECK (permission IN (' || keys || '))';
END $$;
