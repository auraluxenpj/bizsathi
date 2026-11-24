-- Require proof of mobile ownership before resolving a mobile number to an account.
-- This prevents unverified profile metadata from being used as a login identifier.
CREATE OR REPLACE FUNCTION public.login_email_for_mobile(_mobile text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.email::text
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE public.normalize_member_mobile(p.phone) = public.normalize_member_mobile(_mobile)
    AND public.normalize_member_mobile(u.phone) = public.normalize_member_mobile(_mobile)
    AND u.phone_confirmed_at IS NOT NULL
    AND public.normalize_member_mobile(_mobile) IS NOT NULL
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.login_email_for_mobile(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_email_for_mobile(text) TO service_role;
