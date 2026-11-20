-- 0096: create the private payment QR image bucket.
-- The business settings table and object access policies already exist.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-qr', 'payment-qr', false, 2097152, ARRAY['image/png','image/jpeg'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
