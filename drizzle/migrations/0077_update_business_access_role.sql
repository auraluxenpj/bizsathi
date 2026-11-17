-- 0077: allow administrators to edit custom role definitions without changing assignments.
CREATE OR REPLACE FUNCTION public.update_business_access_role(
  _business uuid,_role uuid,_name text,_description text,_permissions text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $update_business_access_role$
DECLARE
  actor_rank smallint;
  role_rank smallint;
  old_permissions jsonb;
  p text;
BEGIN
  actor_rank := public.business_role_rank(_business,auth.uid());
  IF auth.uid() IS NULL OR actor_rank IS NULL OR actor_rank<80 THEN
    RAISE EXCEPTION 'Administrator access is required' USING ERRCODE='42501';
  END IF;
  IF _name IS NULL OR char_length(btrim(_name)) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Role name must contain 2 to 80 characters';
  END IF;
  SELECT authority_rank INTO role_rank
  FROM public.business_access_roles
  WHERE business_id=_business AND id=_role AND is_active AND NOT is_system
  FOR UPDATE;
  IF role_rank IS NULL OR role_rank>=actor_rank THEN
    RAISE EXCEPTION 'Custom role is unavailable or exceeds your authority' USING ERRCODE='42501';
  END IF;
  IF cardinality(COALESCE(_permissions,'{}'))>200 THEN RAISE EXCEPTION 'Too many permissions'; END IF;
  FOREACH p IN ARRAY COALESCE(_permissions,'{}') LOOP
    IF NOT EXISTS(SELECT 1 FROM public.business_permission_catalog WHERE permission=p) THEN
      RAISE EXCEPTION 'Unknown permission: %',p;
    END IF;
    IF NOT public.has_permission(_business,p) THEN
      RAISE EXCEPTION 'You cannot delegate a permission you do not have' USING ERRCODE='42501';
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(permission ORDER BY permission),'[]'::jsonb)
  INTO old_permissions
  FROM public.business_access_role_permissions
  WHERE business_id=_business AND role_id=_role;

  UPDATE public.business_access_roles
  SET name=btrim(_name),description=NULLIF(btrim(COALESCE(_description,'')),'')
  WHERE business_id=_business AND id=_role;

  DELETE FROM public.business_access_role_permissions
  WHERE business_id=_business AND role_id=_role;
  INSERT INTO public.business_access_role_permissions(business_id,role_id,permission)
  SELECT _business,_role,permission_code
  FROM unnest(COALESCE(_permissions,'{}')) AS permission_code
  ON CONFLICT DO NOTHING;

  PERFORM public.write_audit(_business,'access_role.update','business_access_roles',_role::text,
    jsonb_build_object('permissions',old_permissions),
    jsonb_build_object('name',btrim(_name),'permissions',to_jsonb(COALESCE(_permissions,'{}'))));
END;
$update_business_access_role$;
REVOKE ALL ON FUNCTION public.update_business_access_role(uuid,uuid,text,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_business_access_role(uuid,uuid,text,text,text[]) TO authenticated;

