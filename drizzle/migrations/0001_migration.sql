-- Default privileges granted broad access; reset to least privilege.
REVOKE ALL ON public.roles, public.profiles, public.businesses, public.business_memberships,
  public.branches, public.financial_periods, public.business_settings, public.audit_logs FROM anon, authenticated;
GRANT SELECT ON public.roles, public.profiles, public.businesses, public.business_memberships,
  public.branches, public.financial_periods, public.business_settings, public.audit_logs TO authenticated;
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;
GRANT UPDATE (name, legal_name, pan_vat_number) ON public.businesses TO authenticated;
GRANT INSERT ON public.branches TO authenticated;
GRANT UPDATE (code, name, address, is_active) ON public.branches TO authenticated;
GRANT INSERT ON public.financial_periods TO authenticated;
GRANT UPDATE (name, start_date, end_date) ON public.financial_periods TO authenticated;
GRANT UPDATE (currency, calendar_system, fiscal_year_start_month, vat_registered, vat_rate, timezone) ON public.business_settings TO authenticated;
REVOKE USAGE, SELECT ON SEQUENCE public.audit_logs_id_seq FROM anon, authenticated;