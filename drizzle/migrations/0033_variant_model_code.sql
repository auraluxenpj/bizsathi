-- 0033: optional model code on product variants, exported/imported with the SKU so stock can be matched with the website.
-- Additive and safe to re-run. Not unique on purpose: several variants (sizes/colours) can share one model code.
-- Only save_catalogue_variant is replaced: its body is the 0031 definition plus model_code; checks and grants are unchanged.
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS model_code text;
ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS product_variants_model_code_clean;
ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_model_code_clean CHECK (model_code IS NULL OR (model_code = btrim(model_code) AND length(model_code) BETWEEN 1 AND 64));
CREATE INDEX IF NOT EXISTS product_variants_model_code_idx ON public.product_variants (business_id, lower(model_code)) WHERE model_code IS NOT NULL;
CREATE OR REPLACE FUNCTION public.save_catalogue_variant(_business_id uuid, _rows jsonb)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r jsonb; p uuid; n integer:=0;
BEGIN
 IF NOT public.has_business_role(_business_id,'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 IF jsonb_typeof(_rows)<>'array' OR jsonb_array_length(_rows) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Expected 1 to 5000 rows'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
 INSERT INTO public.products(business_id,name,category) VALUES(_business_id,btrim(r->>'product_name'),coalesce(r->>'category','')) ON CONFLICT(business_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO p;
 INSERT INTO public.product_variants(business_id,product_id,name,sku,barcode,unit,selling_price,reorder_level,purchase_price,model_code) VALUES(_business_id,p,coalesce(nullif(btrim(r->>'variant_name'),''),'Standard'),btrim(r->>'sku'),nullif(btrim(r->>'barcode'),''),coalesce(nullif(btrim(r->>'unit'),''),'pcs'),coalesce((r->>'selling_price')::numeric,0),coalesce((r->>'reorder_level')::numeric,0),coalesce((r->>'purchase_price')::numeric,0),nullif(btrim(r->>'model_code'),'')); n:=n+1;
 END LOOP; RETURN n;
END $function$;
