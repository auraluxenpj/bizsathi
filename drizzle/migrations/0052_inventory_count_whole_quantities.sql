-- 0052: Physical inventory counts are whole pieces, not fractional units.
-- NOT VALID preserves any historical fractional count rows while enforcing whole
-- quantities on every new insert or update.
ALTER TABLE public.inventory_count_lines
  ADD CONSTRAINT inventory_count_lines_physical_quantity_whole
  CHECK (physical_quantity IS NULL OR physical_quantity = trunc(physical_quantity))
  NOT VALID;
