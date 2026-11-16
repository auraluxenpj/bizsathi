-- 0057: Keep platform master-owner authority separate from business ownership transfer.
-- The Master Owner has virtual rank 100 for cross-business oversight, but must not use
-- the ordinary Business Owner transfer workflow to replace a business's actual owner.
-- Additive function replacement only; no business or membership rows are changed by this migration.

CREATE OR REPLACE FUNCTION public.transfer_business_ownership(_business_id uuid, _new_owner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  old_owner uuid;
  target_member uuid;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Platform-level authority is deliberately not a substitute for being this
  -- business's actual owner. Platform-owner changes use a separate protected process.
  IF public.platform_owner_check(actor) THEN
    RAISE EXCEPTION 'Platform Master Owner cannot transfer business ownership through the business workflow'
      USING ERRCODE = '42501';
  END IF;

  IF _new_owner IS NULL OR _new_owner = actor THEN
    RAISE EXCEPTION 'Choose another active business member' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.businesses
  WHERE id = _business_id AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business unavailable' USING ERRCODE = '42501';
  END IF;

  -- Require an active owner membership belonging to the caller, not virtual rank 100.
  SELECT user_id INTO old_owner
  FROM public.business_memberships
  WHERE business_id = _business_id
    AND user_id = actor
    AND role_code = 'owner'
    AND status = 'active'
  FOR UPDATE;

  IF old_owner IS NULL THEN
    RAISE EXCEPTION 'Only this business''s active Business Owner can transfer ownership'
      USING ERRCODE = '42501';
  END IF;

  -- Keep platform ownership distinct: a Master Owner cannot be assigned as a
  -- Business Owner through this ordinary transfer workflow.
  IF public.platform_owner_check(_new_owner) THEN
    RAISE EXCEPTION 'Platform Master Owner cannot be assigned through business ownership transfer'
      USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO target_member
  FROM public.business_memberships
  WHERE business_id = _business_id
    AND user_id = _new_owner
    AND status = 'active'
  FOR UPDATE;

  IF target_member IS NULL THEN
    RAISE EXCEPTION 'New owner must be an active member of this business'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.business_memberships
  SET role_code = 'admin'
  WHERE business_id = _business_id AND user_id = old_owner;

  UPDATE public.business_memberships
  SET role_code = 'owner'
  WHERE business_id = _business_id AND user_id = target_member;

  PERFORM public.write_audit(
    _business_id,
    'ownership.transfer',
    'business_memberships',
    target_member::text,
    jsonb_build_object('owner_user_id', old_owner),
    jsonb_build_object('owner_user_id', target_member, 'transferred_by', actor)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_business_ownership(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_business_ownership(uuid, uuid) TO authenticated, service_role;
