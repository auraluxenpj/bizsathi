-- SKU-specific image references point to Auraluxe's central media library.
-- Product-level image_path remains the fallback for all variants without an override.
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS image_path text;

ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variants_image_path_shared_media;
ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_image_path_shared_media
  CHECK (
    image_path IS NULL OR (
      length(image_path) <= 200
      AND image_path LIKE 'https://jsshaoucrjorbyuzagdr.supabase.co/storage/v1/object/public/product-images/%'
      AND position('..' in image_path) = 0
    )
  );

CREATE INDEX IF NOT EXISTS product_variants_image_path_idx
  ON public.product_variants (business_id, image_path)
  WHERE image_path IS NOT NULL;
