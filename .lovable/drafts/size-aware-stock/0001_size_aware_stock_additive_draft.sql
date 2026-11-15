-- DRAFT ONLY — do not execute, register in Drizzle, or apply to production.
-- Additive schema proposal. No legacy stock/document functions are replaced here.
-- Requires staging review and a separately approved migration sequence.

CREATE TABLE public.size_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  size_code text NOT NULL CHECK (size_code IN ('STANDARD','M','L','XL','2XL','3XL','4XL','5XL','6XL','7XL','8XL','UNSORTED')),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 30),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  is_plus boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,id),
  UNIQUE (business_id,size_code),
  UNIQUE (business_id,sort_order),
  CHECK ((size_code IN ('4XL','5XL','6XL','7XL','8XL') AND is_plus) OR
         (size_code NOT IN ('4XL','5XL','6XL','7XL','8XL') AND NOT is_plus))
);
REVOKE ALL ON public.size_master FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.size_master TO authenticated;
GRANT ALL ON public.size_master TO service_role;
ALTER TABLE public.size_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY size_master_read ON public.size_master FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
CREATE TRIGGER size_master_tenant BEFORE UPDATE ON public.size_master
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_change();
CREATE TRIGGER size_master_audit AFTER INSERT OR UPDATE ON public.size_master
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

-- Product-level allowed sizes. Category defaults are application seed guidance,
-- not a database assumption. Owners curate these rows through a checked RPC.
CREATE TABLE public.product_size_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  product_id uuid NOT NULL,
  size_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,id),
  UNIQUE (business_id,product_id,size_id),
  FOREIGN KEY (business_id,product_id)
    REFERENCES public.products(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,size_id)
    REFERENCES public.size_master(business_id,id) ON DELETE RESTRICT
);
REVOKE ALL ON public.product_size_options FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.product_size_options TO authenticated;
GRANT ALL ON public.product_size_options TO service_role;
ALTER TABLE public.product_size_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_size_options_read ON public.product_size_options FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
CREATE INDEX product_size_options_product_idx
  ON public.product_size_options(business_id,product_id,is_active);

-- New size ledger is separate from both legacy quantity ledgers.
-- No client INSERT/UPDATE/DELETE grants; posting must be through future checked RPCs.
CREATE TABLE public.variant_size_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  size_id uuid NOT NULL,
  quantity numeric(18,3) NOT NULL
    CHECK (quantity <> 0 AND quantity::text NOT IN ('NaN','Infinity','-Infinity')),
  movement_kind text NOT NULL CHECK (movement_kind IN
    ('opening','receive','sale','sale_return','adjustment','transfer_in','transfer_out','reservation_release')),
  source_type text NOT NULL CHECK (length(btrim(source_type)) BETWEEN 1 AND 40),
  source_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,id),
  UNIQUE (business_id,idempotency_key),
  FOREIGN KEY (business_id,branch_id)
    REFERENCES public.branches(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,variant_id)
    REFERENCES public.product_variants(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,size_id)
    REFERENCES public.size_master(business_id,id) ON DELETE RESTRICT
);
REVOKE ALL ON public.variant_size_stock_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.variant_size_stock_movements TO authenticated;
GRANT ALL ON public.variant_size_stock_movements TO service_role;
ALTER TABLE public.variant_size_stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY variant_size_stock_read ON public.variant_size_stock_movements FOR SELECT TO authenticated
  USING (public.can_access_branch(business_id,branch_id));
CREATE INDEX variant_size_stock_balance_idx
  ON public.variant_size_stock_movements(business_id,branch_id,variant_id,size_id);
CREATE INDEX variant_size_stock_history_idx
  ON public.variant_size_stock_movements(business_id,created_at DESC);
CREATE TRIGGER variant_size_stock_immutable BEFORE UPDATE OR DELETE
  ON public.variant_size_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();
CREATE TRIGGER variant_size_stock_audit AFTER INSERT
  ON public.variant_size_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

-- Immutable evidence of the legacy aggregate captured for a future cutover.
-- One row per existing branch/variant; baseline_qty is copied only after a
-- transactionally consistent baseline capture, never guessed from category.
CREATE TABLE public.size_stock_migration_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  opening_size_id uuid NOT NULL,
  baseline_qty numeric(18,3) NOT NULL
    CHECK (baseline_qty >= 0 AND baseline_qty::text NOT IN ('NaN','Infinity','-Infinity')),
  baseline_run_id uuid NOT NULL,
  mapping_status text NOT NULL CHECK (mapping_status IN ('pending','reviewed','posted','reconciled')),
  mapping_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,id),
  UNIQUE (business_id,branch_id,variant_id),
  FOREIGN KEY (business_id,branch_id)
    REFERENCES public.branches(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,variant_id)
    REFERENCES public.product_variants(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id,opening_size_id)
    REFERENCES public.size_master(business_id,id) ON DELETE RESTRICT
);
REVOKE ALL ON public.size_stock_migration_map FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.size_stock_migration_map TO authenticated;
GRANT ALL ON public.size_stock_migration_map TO service_role;
ALTER TABLE public.size_stock_migration_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY size_stock_migration_map_read ON public.size_stock_migration_map FOR SELECT TO authenticated
  USING (public.has_business_role(business_id,'admin') AND public.can_access_branch(business_id,branch_id));
CREATE TRIGGER size_stock_migration_map_immutable BEFORE UPDATE OR DELETE
  ON public.size_stock_migration_map
  FOR EACH ROW EXECUTE FUNCTION public.block_mutation();

-- Deliberately no seed, backfill, view/function replacement, write RPC, trigger
-- on legacy tables, commerce line rewrite, website switch, or stock cutover here.
-- UNSORTED must be added as a size_master row in a separately reviewed seed step.
