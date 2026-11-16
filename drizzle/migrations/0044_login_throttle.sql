-- 0044: Failed-login throttle for the server-side mobile sign-in. ADDITIVE.
-- Buckets are SHA-256 hashes computed by the server, so the database never stores raw mobile numbers or IPs.
-- Failures are counted for known and unknown numbers alike, so being blocked reveals nothing about whether an account exists.
CREATE TABLE IF NOT EXISTS public.login_failures (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL CHECK (bucket ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_failures_bucket_idx ON public.login_failures (bucket, created_at DESC);
CREATE INDEX IF NOT EXISTS login_failures_created_idx ON public.login_failures (created_at);
REVOKE ALL ON public.login_failures FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.login_failures TO service_role;
ALTER TABLE public.login_failures ENABLE ROW LEVEL SECURITY;   -- no policies: API roles cannot read or write

CREATE OR REPLACE FUNCTION public.login_throttle_blocked(_bucket text, _max int, _window_seconds int) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) >= _max FROM public.login_failures WHERE bucket = _bucket AND created_at > now() - make_interval(secs => _window_seconds)
$$;
CREATE OR REPLACE FUNCTION public.login_record_failure(_bucket text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.login_failures (bucket) VALUES (_bucket);
  DELETE FROM public.login_failures WHERE created_at < now() - interval '1 day';
END $$;
CREATE OR REPLACE FUNCTION public.login_clear_failures(_bucket text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ DELETE FROM public.login_failures WHERE bucket = _bucket $$;

REVOKE ALL ON FUNCTION public.login_throttle_blocked(text, int, int), public.login_record_failure(text), public.login_clear_failures(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_throttle_blocked(text, int, int), public.login_record_failure(text), public.login_clear_failures(text) TO service_role;
