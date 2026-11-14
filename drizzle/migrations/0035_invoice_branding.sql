-- Phase 2: configurable invoice footer, terms and signature label.
ALTER TABLE public.business_settings
  ADD COLUMN invoice_footer text NOT NULL DEFAULT 'Thank you for your business.',
  ADD COLUMN invoice_terms text NOT NULL DEFAULT '',
  ADD COLUMN invoice_signature_label text NOT NULL DEFAULT 'Authorized Signature';

ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_invoice_footer_length CHECK (char_length(invoice_footer) <= 180),
  ADD CONSTRAINT business_settings_invoice_terms_length CHECK (char_length(invoice_terms) <= 1000),
  ADD CONSTRAINT business_settings_invoice_signature_length CHECK (char_length(invoice_signature_label) <= 80);
