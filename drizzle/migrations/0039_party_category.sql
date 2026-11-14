-- Party category (group) for customers and suppliers, e.g. "Wholesale", "Retail", "Regular".
-- Plain text like products.category: existing parties RLS policies and grants already cover it.
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '' CHECK (char_length(category) <= 60);
CREATE INDEX IF NOT EXISTS parties_business_category_idx ON public.parties (business_id, category);
