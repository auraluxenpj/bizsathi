-- 0132: add covering indexes for rental foreign keys and owner/member lookups.

CREATE INDEX IF NOT EXISTS rental_agreements_created_by_idx ON public.rental_agreements(created_by);
CREATE INDEX IF NOT EXISTS rental_agreements_workspace_tenant_idx ON public.rental_agreements(workspace_id,tenant_id);
CREATE INDEX IF NOT EXISTS rental_audit_events_actor_idx ON public.rental_audit_events(actor_id);
CREATE INDEX IF NOT EXISTS rental_charge_rules_created_by_idx ON public.rental_charge_rules(created_by);
CREATE INDEX IF NOT EXISTS rental_charge_rules_workspace_charge_type_idx ON public.rental_charge_rules(workspace_id,charge_type_id);
CREATE INDEX IF NOT EXISTS rental_charge_rules_workspace_unit_idx ON public.rental_charge_rules(workspace_id,unit_id);
CREATE INDEX IF NOT EXISTS rental_charge_types_created_by_idx ON public.rental_charge_types(created_by);
CREATE INDEX IF NOT EXISTS rental_deposits_recorded_by_idx ON public.rental_deposit_transactions(recorded_by);
CREATE INDEX IF NOT EXISTS rental_deposits_workspace_agreement_idx ON public.rental_deposit_transactions(workspace_id,agreement_id);
CREATE INDEX IF NOT EXISTS rental_deposits_workspace_unit_idx ON public.rental_deposit_transactions(workspace_id,unit_id);
CREATE INDEX IF NOT EXISTS rental_expenses_created_by_idx ON public.rental_expenses(created_by);
CREATE INDEX IF NOT EXISTS rental_expenses_workspace_property_idx ON public.rental_expenses(workspace_id,property_id);
CREATE INDEX IF NOT EXISTS rental_expenses_workspace_unit_idx ON public.rental_expenses(workspace_id,unit_id);
CREATE INDEX IF NOT EXISTS rental_invoice_lines_workspace_charge_type_idx ON public.rental_invoice_lines(workspace_id,charge_type_id);
CREATE INDEX IF NOT EXISTS rental_invoices_approved_by_idx ON public.rental_invoices(approved_by);
CREATE INDEX IF NOT EXISTS rental_invoices_created_by_idx ON public.rental_invoices(created_by);
CREATE INDEX IF NOT EXISTS rental_invoices_sent_by_idx ON public.rental_invoices(sent_by);
CREATE INDEX IF NOT EXISTS rental_invoices_workspace_tenant_idx ON public.rental_invoices(workspace_id,tenant_id);
CREATE INDEX IF NOT EXISTS rental_invoices_workspace_unit_idx ON public.rental_invoices(workspace_id,unit_id);
CREATE INDEX IF NOT EXISTS rental_memberships_created_by_idx ON public.rental_memberships(created_by);
CREATE INDEX IF NOT EXISTS rental_meter_readings_recorded_by_idx ON public.rental_meter_readings(recorded_by);
CREATE INDEX IF NOT EXISTS rental_payments_recorded_by_idx ON public.rental_payments(recorded_by);
CREATE INDEX IF NOT EXISTS rental_properties_created_by_idx ON public.rental_properties(created_by);
CREATE INDEX IF NOT EXISTS rental_tenants_created_by_idx ON public.rental_tenants(created_by);
CREATE INDEX IF NOT EXISTS rental_units_created_by_idx ON public.rental_units(created_by);
