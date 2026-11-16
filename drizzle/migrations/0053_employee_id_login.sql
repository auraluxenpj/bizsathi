-- 0053: Globally unique employee identifier and server-only login resolution.
-- Employee IDs are assigned automatically when an account first receives a business membership.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS employee_id text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_employee_id_unique
  ON public.profiles (upper(employee_id))
  WHERE employee_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_employee_id_after_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.profiles
     SET employee_id = 'BS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
         updated_at = now()
   WHERE id = NEW.user_id AND employee_id IS NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_employee_id_after_membership() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS assign_employee_id_after_membership ON public.business_memberships;
CREATE TRIGGER assign_employee_id_after_membership
AFTER INSERT ON public.business_memberships
FOR EACH ROW EXECUTE FUNCTION public.assign_employee_id_after_membership();\n\n-- Give existing active members an ID as part of the rollout.\nUPDATE public.profiles p\nSET employee_id = 'BS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), updated_at = now()\nWHERE p.employee_id IS NULL\n  AND EXISTS (SELECT 1 FROM public.business_memberships bm JOIN public.businesses b ON b.id = bm.business_id\n              WHERE bm.user_id = p.id AND bm.status = 'active' AND b.archived_at IS NULL);

CREATE OR REPLACE FUNCTION public.login_email_for_employee_id(_employee_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.email::text
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE upper(p.employee_id) = upper(btrim(_employee_id))
    AND EXISTS (
      SELECT 1 FROM public.business_memberships m
      JOIN public.businesses b ON b.id = m.business_id
      WHERE m.user_id = p.id AND m.status = 'active' AND b.archived_at IS NULL
    )
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.login_email_for_employee_id(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_email_for_employee_id(text) TO service_role;
