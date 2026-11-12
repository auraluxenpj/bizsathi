-- 0035: One photo per product. Additive and safe to re-run.
-- * products.image_path holds the single photo: a plain column, so a product can never have more than one.
-- * The photo lives in a private storage bucket 'product-images' under <business_id>/<product_id>/<file>.
-- * The path must belong to the same business and product (CHECK), so a product cannot point at another product's or business's file.
-- * Setting the photo is an ordinary UPDATE of products, so the existing administrator policy, custom permission denials and audit trigger all apply.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_path text;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_image_path_own;
ALTER TABLE public.products ADD CONSTRAINT products_image_path_own CHECK(image_path IS NULL OR (length(image_path)<=200 AND image_path LIKE business_id::text||'/'||id::text||'/%' AND image_path ~ '\.(webp|jpg|png)$' AND image_path !~ '\.\.'));

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('product-images','product-images',false,2097152,ARRAY['image/webp','image/jpeg','image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.product_image_business(_name text) RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN split_part(_name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN split_part(_name,'/',1)::uuid END $$;
REVOKE EXECUTE ON FUNCTION public.product_image_business(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.product_image_business(text) TO authenticated;

DROP POLICY IF EXISTS product_images_read ON storage.objects;
DROP POLICY IF EXISTS product_images_add ON storage.objects;
DROP POLICY IF EXISTS product_images_delete ON storage.objects;
CREATE POLICY product_images_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='product-images' AND public.is_business_member(public.product_image_business(name)));
CREATE POLICY product_images_add ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='product-images' AND public.has_business_role(public.product_image_business(name),'admin'));
CREATE POLICY product_images_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='product-images' AND public.has_business_role(public.product_image_business(name),'admin'));
