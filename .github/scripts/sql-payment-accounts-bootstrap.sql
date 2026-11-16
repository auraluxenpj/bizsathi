-- Test-only compatibility baseline for migration 0024, which is intentionally
-- a no-op on hosted databases. Run immediately after 0000 has created the
-- businesses table and has_business_role helper, before later migrations
-- attach triggers to these tables. This only runs in disposable CI Postgres.
CREATE TABLE IF NOT EXISTS public.payment_accounts (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('cash','bank','wallet')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_accounts_name_idx
  ON public.payment_accounts(business_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.account_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.payment_accounts(id) ON DELETE RESTRICT,
  amount numeric(16,2) NOT NULL CHECK (amount <> 0),
  source_type text NOT NULL CHECK (source_type IN ('payment','voucher')),
  source_id uuid NOT NULL,
  entry_date date NOT NULL,
  memo text NOT NULL DEFAULT '' CHECK (char_length(memo) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS account_movements_account_idx
  ON public.account_movements(account_id, entry_date);

ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_accounts_read ON public.payment_accounts;
CREATE POLICY payment_accounts_read ON public.payment_accounts
  FOR SELECT TO authenticated
  USING (public.has_business_role(business_id, 'accountant'));
DROP POLICY IF EXISTS account_movements_read ON public.account_movements;
CREATE POLICY account_movements_read ON public.account_movements
  FOR SELECT TO authenticated
  USING (public.has_business_role(business_id, 'accountant'));
REVOKE ALL ON public.payment_accounts, public.account_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_accounts, public.account_movements TO authenticated;
