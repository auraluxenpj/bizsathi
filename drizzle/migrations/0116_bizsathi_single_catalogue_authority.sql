-- 0116: BizSathi is the sole catalogue and stock authority for Auraluxe.
-- Auraluxe-origin catalogue writes are rejected. Existing rows and event history remain intact.
CREATE OR REPLACE FUNCTION public.upsert_shared_catalogue_from_auraluxe(_business_id uuid,_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RAISE EXCEPTION 'BizSathi is the sole catalogue authority; Auraluxe catalogue writes are not accepted';
END $$;
REVOKE ALL ON FUNCTION public.upsert_shared_catalogue_from_auraluxe(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
