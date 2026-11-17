-- 0092: secure foundation for customer credit reminders.
-- This migration is additive: it does not schedule or send messages.
-- Delivery is deliberately disabled until the Meta Cloud API worker and business
-- configuration are deployed and explicitly activated.

ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS whatsapp_marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at timestamptz;

CREATE TABLE IF NOT EXISTS public.whatsapp_credit_reminder_settings (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  weekday smallint NOT NULL DEFAULT 1 CHECK (weekday BETWEEN 0 AND 6),
  local_time time NOT NULL DEFAULT '10:00',
  timezone text NOT NULL DEFAULT 'Asia/Kathmandu',
  template_name text,
  language_code text NOT NULL DEFAULT 'en',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (template_name IS NULL OR length(btrim(template_name)) BETWEEN 1 AND 128),
  CHECK (length(btrim(timezone)) BETWEEN 1 AND 80)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_credit_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  party_id uuid NOT NULL,
  cycle_key text NOT NULL CHECK (cycle_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  trigger_source text NOT NULL CHECK (trigger_source IN ('scheduled','manual')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','delivered','read','failed','skipped')),
  recipient_phone text NOT NULL CHECK (length(btrim(recipient_phone)) BETWEEN 5 AND 32),
  balance_snapshot numeric(18,2) NOT NULL CHECK (balance_snapshot > 0),
  currency_code text NOT NULL DEFAULT 'NPR' CHECK (currency_code ~ '^[A-Z]{3}$'),
  template_name text,
  provider_message_id text,
  error_code text,
  error_message text,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id,party_id) REFERENCES public.parties(business_id,id) ON DELETE RESTRICT
);

-- A party can receive at most one scheduled reminder per business week.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_credit_reminder_weekly_once
  ON public.whatsapp_credit_reminder_log(business_id,party_id,cycle_key)
  WHERE trigger_source='scheduled';

CREATE INDEX IF NOT EXISTS whatsapp_credit_reminder_history
  ON public.whatsapp_credit_reminder_log(business_id,party_id,requested_at DESC);

ALTER TABLE public.whatsapp_credit_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_credit_reminder_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.whatsapp_credit_reminder_settings,
  public.whatsapp_credit_reminder_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_credit_reminder_settings TO authenticated;
GRANT SELECT ON public.whatsapp_credit_reminder_log TO authenticated;
GRANT ALL ON public.whatsapp_credit_reminder_settings,
  public.whatsapp_credit_reminder_log TO service_role;

DROP POLICY IF EXISTS whatsapp_credit_reminder_settings_read
  ON public.whatsapp_credit_reminder_settings;
CREATE POLICY whatsapp_credit_reminder_settings_read
  ON public.whatsapp_credit_reminder_settings
  FOR SELECT TO authenticated
  USING (public.is_business_member(business_id) AND public.has_permission(business_id,'settings.edit'));

DROP POLICY IF EXISTS whatsapp_credit_reminder_settings_write
  ON public.whatsapp_credit_reminder_settings;
CREATE POLICY whatsapp_credit_reminder_settings_write
  ON public.whatsapp_credit_reminder_settings
  FOR ALL TO authenticated
  USING (public.is_business_member(business_id) AND public.has_permission(business_id,'settings.edit'))
  WITH CHECK (public.is_business_member(business_id) AND public.has_permission(business_id,'settings.edit'));

DROP POLICY IF EXISTS whatsapp_credit_reminder_log_read
  ON public.whatsapp_credit_reminder_log;
CREATE POLICY whatsapp_credit_reminder_log_read
  ON public.whatsapp_credit_reminder_log
  FOR SELECT TO authenticated
  USING (public.is_business_member(business_id)
    AND public.has_permission(business_id,'customers.view'));

COMMENT ON COLUMN public.parties.whatsapp_marketing_opt_in IS
  'Explicit customer consent for WhatsApp credit reminders; false by default.';
COMMENT ON TABLE public.whatsapp_credit_reminder_settings IS
  'Business-level reminder schedule. enabled remains false until Meta configuration and worker are ready.';
COMMENT ON TABLE public.whatsapp_credit_reminder_log IS
  'Auditable WhatsApp reminder attempts. Service role owns status updates; members receive read-only history.';
