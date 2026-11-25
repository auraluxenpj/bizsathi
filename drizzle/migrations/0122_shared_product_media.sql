-- Shared Auraluxe media URLs can be referenced by BizSathi without duplicating objects.
-- Existing business/product-scoped paths remain valid during the transition.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_image_path_own;
ALTER TABLE public.products ADD CONSTRAINT products_image_path_own CHECK (
  image_path IS NULL OR (
    length(image_path) <= 200
    AND (
      (image_path LIKE business_id::text || '/' || id::text || '/%')
      OR image_path LIKE 'https://jsshaoucrjorbyuzagdr.supabase.co/storage/v1/object/public/product-images/%'
    )
    AND image_path ~ '\\.(webp|jpg|png)$'
    AND image_path !~ '\\.\\.'
  )
);
