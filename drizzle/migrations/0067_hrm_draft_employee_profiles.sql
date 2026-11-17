-- 0067: HRM draft employee profiles for pre-onboarding staff without a login.
-- These records are directory-only until a real BizSathi member account is linked.
CREATE TABLE public.hr_employee_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  branch_id uuid,
  employee_number text NOT NULL CHECK (employee_number ~ '^[A-Z0-9_-]{3,24}$'),
  full_name text NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 2 AND 120),
  email text CHECK (email IS NULL OR char_length(email) <= 254),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 30),
  department text CHECK (department IS NULL OR char_length(department) <= 100),
  designation text CHECK (designation IS NULL OR char_length(designation) <= 100),
  joining_date date,
  profile_status text NOT NULL DEFAULT 'draft' CHECK (profile_status IN ('draft','ready_to_link','linked','archived')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, employee_number),
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT
);
CREATE INDEX hr_employee_drafts_business_idx ON public.hr_employee_drafts(business_id, profile_status, created_at DESC);
ALTER TABLE public.hr_employee_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_employee_drafts FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.hr_employee_drafts TO authenticated;
CREATE POLICY hr_employee_drafts_read ON public.hr_employee_drafts FOR SELECT TO authenticated
  USING (public.hr_is_manager(business_id));
CREATE POLICY hr_employee_drafts_insert ON public.hr_employee_drafts FOR INSERT TO authenticated
  WITH CHECK (public.hr_is_manager(business_id) AND created_by = auth.uid());
CREATE POLICY hr_employee_drafts_update ON public.hr_employee_drafts FOR UPDATE TO authenticated
  USING (public.hr_is_manager(business_id))
  WITH CHECK (public.hr_is_manager(business_id));
