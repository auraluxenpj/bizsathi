-- 0062: configurable leave accrual, attendance/overtime policy and employee profile maintenance.
ALTER TABLE public.hr_leave_types
  ADD COLUMN IF NOT EXISTS accrual_method text NOT NULL DEFAULT 'front_loaded'
    CHECK (accrual_method IN ('front_loaded','monthly'));

CREATE TABLE IF NOT EXISTS public.hr_attendance_policies (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE RESTRICT,
  workday_minutes integer NOT NULL DEFAULT 480 CHECK (workday_minutes BETWEEN 60 AND 1440),
  unpaid_break_minutes integer NOT NULL DEFAULT 60 CHECK (unpaid_break_minutes BETWEEN 0 AND 480),
  grace_minutes integer NOT NULL DEFAULT 10 CHECK (grace_minutes BETWEEN 0 AND 240),
  overtime_after_minutes integer NOT NULL DEFAULT 0 CHECK (overtime_after_minutes BETWEEN 0 AND 720),
  overtime_multiplier numeric(4,2) NOT NULL DEFAULT 1.5 CHECK (overtime_multiplier BETWEEN 1 AND 3),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hr_attendance_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_attendance_policies FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.hr_attendance_policies TO authenticated;
DROP POLICY IF EXISTS hr_attendance_policy_read ON public.hr_attendance_policies;
CREATE POLICY hr_attendance_policy_read ON public.hr_attendance_policies FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
DROP POLICY IF EXISTS hr_attendance_policy_manage ON public.hr_attendance_policies;
CREATE POLICY hr_attendance_policy_manage ON public.hr_attendance_policies FOR ALL TO authenticated
  USING (public.hr_is_manager(business_id))
  WITH CHECK (public.hr_is_manager(business_id) AND (updated_by IS NULL OR updated_by=auth.uid()));

COMMENT ON COLUMN public.hr_leave_types.accrual_method IS
  'front_loaded makes the annual quota available at year start; monthly accrues one twelfth per elapsed calendar month. Configure according to approved employer policy.';
COMMENT ON TABLE public.hr_attendance_policies IS
  'Business-level attendance settings. Overtime is an estimate for review, not an automatic statutory payroll payment.';
