-- 0083: expose role authority metadata for protected employee-management controls.
CREATE OR REPLACE FUNCTION public.get_business_member_access_roles(_business uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $member_access_roles$
DECLARE result jsonb;
BEGIN
  IF COALESCE(public.business_role_rank(_business,auth.uid()),0)<80 THEN
    RAISE EXCEPTION 'Administrator access is required' USING ERRCODE='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'userId',a.user_id,'roleId',r.id,'roleCode',r.code,'roleName',r.name,'authorityRank',r.authority_rank,
    'isDefault',a.is_default,'assignedAt',a.assigned_at
  ) ORDER BY a.user_id,r.name),'[]'::jsonb)
  INTO result
  FROM public.business_member_access_roles a
  JOIN public.business_access_roles r
    ON r.business_id=a.business_id AND r.id=a.role_id
  JOIN public.business_memberships m
    ON m.business_id=a.business_id AND m.user_id=a.user_id
  WHERE a.business_id=_business AND m.status='active';
  RETURN result;
END;
$member_access_roles$;
REVOKE ALL ON FUNCTION public.get_business_member_access_roles(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_business_member_access_roles(uuid) TO authenticated;
