-- 0023: Let one catalogue import carry up to 5000 rows (was 1000).
-- Replaces only the row limit and its message inside save_catalogue_variant. The import stays all-or-nothing:
-- if any row is invalid or duplicates an existing SKU, nothing is saved.
DO $patch$
DECLARE def text; patched text;
BEGIN
  def := pg_get_functiondef('public.save_catalogue_variant(uuid,jsonb)'::regprocedure);
  patched := replace(replace(def, 'NOT BETWEEN 1 AND 1000', 'NOT BETWEEN 1 AND 5000'), 'Expected 1 to 1000 rows', 'Expected 1 to 5000 rows');
  IF patched = def THEN RAISE EXCEPTION 'save_catalogue_variant limit not recognised'; END IF;
  EXECUTE patched;
END $patch$;
