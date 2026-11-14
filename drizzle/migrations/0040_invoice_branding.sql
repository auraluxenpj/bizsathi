-- 0040: Configurable invoice footer, terms and signature label.
-- Renumbered from the conflicting 0035_invoice_branding filename.
-- Idempotent so it is safe if the columns were applied manually before migration tracking.
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS invoice_footer text NOT NULL DEFAULT 'Thank you for your business.',
  ADD COLUMN IF NOT EXISTS invoice_terms text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_signature_label text NOT NULL DEFAULT 'Authorized Signature';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_settings'::regclass
      AND conname = 'business_settings_invoice_footer_length'
  ) THEN
    ALTER TABLE public.business_settings
      ADD CONSTRAINT business_settings_invoice_footer_length
      CHECK (char_length(invoice_footer) <= 180);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_settings'::regclass
      AND conname = 'business_settings_invoice_terms_length'
  ) THEN
    ALTER TABLE public.business_settings
      ADD CONSTRAINT business_settings_invoice_terms_length
      CHECK (char_length(invoice_terms) <= 1000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_settings'::regclass
      AND conname = 'business_settings_invoice_signature_length'
  ) THEN
    ALTER TABLE public.business_settings
      ADD CONSTRAINT business_settings_invoice_signature_length
      CHECK (char_length(invoice_signature_label) <= 80);
  END IF;
END $$;
