ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS purchase_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0);
CREATE OR REPLACE FUNCTION public.save_catalogue_variant(_business_id uuid, _rows jsonb)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r jsonb; p uuid; n integer:=0;
BEGIN
 IF NOT public.has_business_role(_business_id,'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 IF jsonb_typeof(_rows)<>'array' OR jsonb_array_length(_rows) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Expected 1 to 5000 rows'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
 INSERT INTO public.products(business_id,name,category) VALUES(_business_id,btrim(r->>'product_name'),coalesce(r->>'category','')) ON CONFLICT(business_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO p;
 INSERT INTO public.product_variants(business_id,product_id,name,sku,barcode,unit,selling_price,reorder_level,purchase_price) VALUES(_business_id,p,coalesce(nullif(btrim(r->>'variant_name'),''),'Standard'),btrim(r->>'sku'),nullif(btrim(r->>'barcode'),''),coalesce(nullif(btrim(r->>'unit'),''),'pcs'),coalesce((r->>'selling_price')::numeric,0),coalesce((r->>'reorder_level')::numeric,0),coalesce((r->>'purchase_price')::numeric,0)); n:=n+1;
 END LOOP; RETURN n;
END $function$;