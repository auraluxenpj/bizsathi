-- 0053: Globally unique employee identifier and server-only login resolution.
-- Employee IDs are assigned sequentially (AL0001, AL0002, ...) when an account first receives a business membership.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS employee_id text;

CREATE SEQUENCE IF NOT EXISTS public.employee_id_seq START WITH 1 INCREMENT BY 1 NO CYCLE;
REVOKE ALL ON SEQUENCE public.employee_id_seq FROM PUBLIC, anon, authenticated;

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
     SET employee_id = 'AL' || lpad(nextval('public.employee_id_seq')::text, 4, '0'),
         updated_at = now()
   WHERE id = NEW.user_id AND employee_id IS NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_employee_id_after_membership() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS assign_employee_id_after_membership ON public.business_memberships;
CREATE TRIGGER assign_employee_id_after_membership
AFTER INSERT ON public.business_memberships
FOR EACH ROW EXECUTE FUNCTION public.assign_employee_id_after_membership();

-- Give existing active members an ID as part of the rollout.
UPDATE public.profiles p
SET employee_id = 'AL' || lpad(nextval('public.employee_id_seq')::text, 4, '0'), updated_at = now()
WHERE p.employee_id IS NULL
  AND EXISTS (SELECT 1 FROM public.business_memberships bm JOIN public.businesses b ON b.id = bm.business_id
              WHERE bm.user_id = p.id AND bm.status = 'active' AND b.archived_at IS NULL);

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
