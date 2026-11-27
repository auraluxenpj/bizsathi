-- 0136: lock rental ownership/audit columns and enforce actor attribution on inserts.

-- Restrict editable columns so clients cannot move records between workspaces or rewrite authorship.
REVOKE UPDATE ON public.rental_workspaces FROM authenticated;
GRANT UPDATE (name,currency,timezone,invoice_prefix,due_day) ON public.rental_workspaces TO authenticated;

REVOKE UPDATE ON public.rental_properties FROM authenticated;
GRANT UPDATE (name,address,city,state,postal_code,country,notes,is_active) ON public.rental_properties TO authenticated;

REVOKE UPDATE ON public.rental_units FROM authenticated;
GRANT UPDATE (property_id,unit_code,floor_label,status,monthly_rent,security_deposit,due_day,electricity_rate,notes) ON public.rental_units TO authenticated;

REVOKE UPDATE ON public.rental_tenants FROM authenticated;
GRANT UPDATE (full_name,phone,whatsapp_number,email,notes,status) ON public.rental_tenants TO authenticated;

REVOKE UPDATE ON public.rental_agreements FROM authenticated;
GRANT UPDATE (unit_id,tenant_id,agreement_ref,start_date,end_date,monthly_rent,security_deposit,due_day,status,notes) ON public.rental_agreements TO authenticated;

REVOKE UPDATE ON public.rental_charge_types FROM authenticated;
GRANT UPDATE (code,name,category,is_active) ON public.rental_charge_types TO authenticated;

REVOKE UPDATE ON public.rental_charge_rules FROM authenticated;
GRANT UPDATE (property_id,unit_id,charge_type_id,allocation_method,amount,allocation_percent,is_recurring,start_date,end_date,is_active,notes) ON public.rental_charge_rules TO authenticated;

REVOKE UPDATE ON public.rental_meter_readings FROM authenticated;
GRANT UPDATE (unit_id,meter_type,period_start,period_end,previous_reading,current_reading,rate_per_unit,read_at,notes) ON public.rental_meter_readings TO authenticated;

REVOKE UPDATE ON public.rental_invoice_lines FROM authenticated;
GRANT UPDATE (charge_type_id,description,category,quantity,unit_rate,amount) ON public.rental_invoice_lines TO authenticated;

REVOKE UPDATE ON public.rental_expenses FROM authenticated;
GRANT UPDATE (property_id,unit_id,category,description,amount,expense_date,payment_method,reference,notes) ON public.rental_expenses TO authenticated;

DROP POLICY IF EXISTS rental_properties_insert ON public.rental_properties;
CREATE POLICY rental_properties_insert ON public.rental_properties
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant') AND created_by=(select auth.uid()));

DROP POLICY IF EXISTS rental_units_insert ON public.rental_units;
CREATE POLICY rental_units_insert ON public.rental_units
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant') AND created_by=(select auth.uid()));

DROP POLICY IF EXISTS rental_tenants_insert ON public.rental_tenants;
CREATE POLICY rental_tenants_insert ON public.rental_tenants
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant') AND created_by=(select auth.uid()));

DROP POLICY IF EXISTS rental_agreements_insert ON public.rental_agreements;
CREATE POLICY rental_agreements_insert ON public.rental_agreements
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant') AND created_by=(select auth.uid()));

DROP POLICY IF EXISTS rental_charge_types_insert ON public.rental_charge_types;
CREATE POLICY rental_charge_types_insert ON public.rental_charge_types
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant') AND created_by=(select auth.uid()));

DROP POLICY IF EXISTS rental_charge_rules_insert ON public.rental_charge_rules;
CREATE POLICY rental_charge_rules_insert ON public.rental_charge_rules
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant') AND created_by=(select auth.uid()));

DROP POLICY IF EXISTS rental_meter_readings_insert ON public.rental_meter_readings;
CREATE POLICY rental_meter_readings_insert ON public.rental_meter_readings
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant') AND recorded_by=(select auth.uid()));

DROP POLICY IF EXISTS rental_expenses_insert ON public.rental_expenses;
CREATE POLICY rental_expenses_insert ON public.rental_expenses
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant') AND created_by=(select auth.uid()));

DROP POLICY IF EXISTS rental_deposit_transactions_insert ON public.rental_deposit_transactions;
CREATE POLICY rental_deposit_transactions_insert ON public.rental_deposit_transactions
  FOR INSERT TO authenticated WITH CHECK (rental_private.has_role(workspace_id,'accountant') AND recorded_by=(select auth.uid()));

CREATE OR REPLACE FUNCTION rental_private.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DO $touch$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'rental_workspaces','rental_memberships','rental_properties','rental_units',
    'rental_tenants','rental_agreements','rental_charge_types','rental_charge_rules','rental_invoices'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch_updated_at ON public.%I',tbl,tbl);
    EXECUTE format('CREATE TRIGGER %I_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION rental_private.touch_updated_at()',tbl,tbl);
  END LOOP;
END;
$touch$;

REVOKE ALL ON FUNCTION rental_private.touch_updated_at() FROM PUBLIC,anon;
