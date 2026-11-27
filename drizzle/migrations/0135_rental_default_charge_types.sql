-- 0135: seed standard recurring rental charge types for each new workspace.

CREATE OR REPLACE FUNCTION rental_private.create_workspace(_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE result_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.business_memberships m
    JOIN public.businesses b ON b.id=m.business_id AND b.archived_at IS NULL
    WHERE m.user_id=auth.uid() AND m.role_code='owner' AND m.status='active'
  ) THEN
    RAISE EXCEPTION 'An active business owner account is required to create the rental workspace' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  SELECT id INTO result_id FROM public.rental_workspaces WHERE owner_user_id=auth.uid() AND archived_at IS NULL;
  IF result_id IS NOT NULL THEN RETURN result_id; END IF;
  INSERT INTO public.rental_workspaces(name,owner_user_id)
  VALUES (coalesce(nullif(btrim(_name),''),'Rental Property Management'),auth.uid())
  RETURNING id INTO result_id;
  INSERT INTO public.rental_memberships(workspace_id,user_id,role,status,created_by)
  VALUES (result_id,auth.uid(),'owner','active',auth.uid());
  INSERT INTO public.rental_charge_types(workspace_id,code,name,category,created_by)
  VALUES
    (result_id,'water','Common water','water',auth.uid()),
    (result_id,'maintenance','Common maintenance','maintenance',auth.uid()),
    (result_id,'parking','Parking','parking',auth.uid()),
    (result_id,'cleaning','Common cleaning','cleaning',auth.uid()),
    (result_id,'other','Other charge','other',auth.uid())
  ON CONFLICT (workspace_id,code) DO NOTHING;
  RETURN result_id;
END;
$fn$;
