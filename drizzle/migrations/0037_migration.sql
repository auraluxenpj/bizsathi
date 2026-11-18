DROP POLICY IF EXISTS business_permission_catalog_read ON public.business_permission_catalog;
CREATE POLICY business_permission_catalog_read ON public.business_permission_catalog
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.business_memberships m WHERE m.user_id = auth.uid()));