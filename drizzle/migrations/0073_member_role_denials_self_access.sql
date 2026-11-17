-- 0073: let every active employee read their own effective position denials.
-- Administrators may read all employee position denials for the selected business.
-- This mirrors member_permission_denials RLS and supports useCan() for non-admin staff.

CREATE OR REPLACE FUNCTION public.member_role_denials(_business uuid)
RETURNS TABLE(user_id uuid, permission text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rank smallint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_rank := public.business_role_rank(_business, auth.uid());
  IF v_rank IS NULL THEN
    RAISE EXCEPTION 'Active business membership is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT m.user_id, denied.permission
  FROM public.business_memberships m
  LEFT JOIN public.business_role_templates t
    ON t.business_id = m.business_id AND t.job_title = m.job_title
  CROSS JOIN LATERAL unnest(
    CASE WHEN t.business_id IS NOT NULL THEN t.denied_permissions
         ELSE ARRAY(SELECT d.permission FROM public.job_title_denials d WHERE d.job_title = m.job_title)
    END
  ) AS denied(permission)
  WHERE m.business_id = _business
    AND m.status = 'active'
    AND m.job_title IS NOT NULL
    AND (v_rank >= 80 OR m.user_id = auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.member_role_denials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_role_denials(uuid) TO authenticated;

COMMENT ON FUNCTION public.member_role_denials(uuid) IS
  'Returns all position denials to business administrators and only the caller''s own position denials to ordinary employees.';
