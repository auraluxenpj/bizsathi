-- 0054: Standardize employee IDs to the ALEMP0001 format.
-- Preserve the numeric suffix already allocated by employee_id_seq.
UPDATE public.profiles
SET employee_id = 'ALEMP' || substring(employee_id FROM 3),
    updated_at = now()
WHERE employee_id ~* '^AL[0-9]{4,}$';

CREATE OR REPLACE FUNCTION public.assign_employee_id_after_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.profiles
     SET employee_id = 'ALEMP' || lpad(nextval('public.employee_id_seq')::text, 4, '0'),
         updated_at = now()
   WHERE id = NEW.user_id AND employee_id IS NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_employee_id_after_membership() FROM PUBLIC, anon, authenticated;
