-- Staging-only, idempotent Size Master seed.
-- Run after a legitimate synthetic staging business and authenticated owner exist.
-- Does not create a business, user, or production data.
INSERT INTO public.size_master
  (business_id, size_code, label, sort_order, is_plus, is_active)
SELECT b.id, s.size_code, s.label, s.sort_order, s.is_plus, true
FROM public.businesses b
CROSS JOIN (VALUES
  ('STANDARD','STANDARD',0,false),
  ('M','M',1,false),
  ('L','L',2,false),
  ('XL','XL',3,false),
  ('2XL','2XL',4,false),
  ('3XL','3XL',5,false),
  ('4XL','4XL',6,true),
  ('5XL','5XL',7,true),
  ('6XL','6XL',8,true),
  ('7XL','7XL',9,true),
  ('8XL','8XL',10,true)
) AS s(size_code,label,sort_order,is_plus)
ON CONFLICT DO NOTHING;
