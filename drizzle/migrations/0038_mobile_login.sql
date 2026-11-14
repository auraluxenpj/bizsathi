-- 0038: Sign in with email OR mobile number. Safe to re-run.
-- The mobile is kept on profiles.phone in normalised 10-digit form (+977/977 removed), one account per mobile.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name, phone)
  VALUES (NEW.id, left(NEW.raw_user_meta_data->>'full_name', 200), public.normalize_member_mobile(NEW.raw_user_meta_data->>'mobile'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- One account per mobile number (existing duplicates, if any, must be fixed before this succeeds).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_mobile_unique ON public.profiles (public.normalize_member_mobile(phone)) WHERE public.normalize_member_mobile(phone) IS NOT NULL;

-- Server-only lookup used by the sign-in server function; never callable from the browser.
CREATE OR REPLACE FUNCTION public.login_email_for_mobile(_mobile text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT u.email::text FROM public.profiles p JOIN auth.users u ON u.id = p.id
  WHERE public.normalize_member_mobile(p.phone) = public.normalize_member_mobile(_mobile) AND public.normalize_member_mobile(_mobile) IS NOT NULL LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.login_email_for_mobile(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_email_for_mobile(text) TO service_role;
