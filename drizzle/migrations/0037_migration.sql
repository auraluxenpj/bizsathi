-- 0037: permission catalog read policy.
-- The catalog is introduced later by 0074 on clean database replays. Guard this
-- legacy policy migration so lexical replay can continue before that table exists.
DO $permission_catalog_policy$
BEGIN
  IF to_regclass('public.business_permission_catalog') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS business_permission_catalog_read ON public.business_permission_catalog';
    EXECUTE $policy$
      CREATE POLICY business_permission_catalog_read ON public.business_permission_catalog
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.business_memberships m WHERE m.user_id = auth.uid()))
    $policy$;
  END IF;
END;
$permission_catalog_policy$;
