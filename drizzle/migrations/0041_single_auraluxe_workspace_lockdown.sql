-- 0041: Lock business creation at the database boundary for the single AURALUXE workspace.
-- Preserve the function signature for compatibility, but reject every API-role invocation.
-- Existing businesses, memberships, branches, inventory and financial records are untouched.
CREATE OR REPLACE FUNCTION public.create_business(
  _name text,
  _legal_name text DEFAULT NULL,
  _pan_vat text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Business registration is disabled. The AURALUXE workspace is provisioned by an administrator.'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.create_business(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.create_business(text, text, text)
  IS 'Disabled for the single AURALUXE workspace. Existing business and membership data are preserved.';
