import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (client: unknown) => client as SupabaseClient<any, 'public', any>;
const workspaceInput = z.object({ workspaceId: z.string().uuid() });
const money = z.number().finite().min(0).max(999999999);
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const fail = (message: string, error?: { code?: string; message?: string }) => {
  if (error) console.error(message, error.code, error.message);
  throw new Error(message);
};

async function rentalRole(client: unknown, workspaceId: string, allowed: string[] = ['owner', 'accountant', 'viewer']) {
  const { data, error } = await db(client).from('rental_memberships')
    .select('role,status').eq('workspace_id', workspaceId).eq('user_id', (await db(client).auth.getUser()).data.user?.id ?? '').maybeSingle();
  if (error || !data || data.status !== 'active' || !allowed.includes(data.role)) {
    throw new Error('Rental Property Management access could not be verified.');
  }
  return data.role as string;
}

export const getRentalAccess = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: memberships, error } = await db(context.supabase).from('rental_memberships')
      .select('role,status,rental_workspaces!inner(id,name,currency,due_day,invoice_prefix,created_at)')
      .eq('user_id', context.userId).eq('status', 'active');
    if (error) fail('Rental workspace access could not be loaded.', error);
    const workspaces = (memberships ?? []).map(row => ({ ...row.rental_workspaces, role: row.role }));
    if (workspaces.length) return { canAccess: true, canCreate: false, workspaces };
    const { data: ownerMemberships, error: ownerError } = await db(context.supabase).from('business_memberships')
      .select('business_id,businesses!inner(archived_at)').eq('user_id', context.userId).eq('role_code', 'owner').eq('status', 'active').is('businesses.archived_at', null);
    if (ownerError) fail('Business owner authority could not be verified.', ownerError);
    const canCreate = (ownerMemberships ?? []).length > 0;
    return { canAccess: canCreate, canCreate, workspaces: [] };
  });

export const listRentalWorkspaces = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await db(context.supabase).from('rental_memberships')
      .select('role,status,rental_workspaces!inner(id,name,currency,due_day,invoice_prefix,created_at)')
      .eq('user_id', context.userId).eq('status', 'active');
    if (error) fail('Rental workspace access could not be loaded.', error);
    return (data ?? []).map(row => ({ ...row.rental_workspaces, role: row.role }));
  });

export const createRentalWorkspace = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ name: z.string().trim().min(1).max(120).default('Rental Property Management') }))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await db(context.supabase).rpc('create_rental_workspace', { _name: data.name });
    if (error || !id) fail('Rental workspace could not be created. Platform owner access is required.', error ?? undefined);
    return { id: id as string };
  });

export const getRentalOverview = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator(workspaceInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId);
    const [properties, units, agreements, invoices, payments, expenses] = await Promise.all([
      db(context.supabase).from('rental_properties').select('id', { count: 'exact', head: true }).eq('workspace_id', data.workspaceId).eq('is_active', true),
      db(context.supabase).from('rental_units').select('id,status,monthly_rent').eq('workspace_id', data.workspaceId),
      db(context.supabase).from('rental_agreements').select('id,monthly_rent').eq('workspace_id', data.workspaceId).eq('status', 'active'),
      db(context.supabase).from('rental_invoices').select('id,total,status,due_date').eq('workspace_id', data.workspaceId).neq('status', 'void'),
      db(context.supabase).from('rental_payments').select('invoice_id,amount').eq('workspace_id', data.workspaceId),
      db(context.supabase).from('rental_expenses').select('amount,expense_date').eq('workspace_id', data.workspaceId),
    ]);
    const failed = [properties, units, agreements, invoices, payments, expenses].find(r => r.error);
    if (failed?.error) fail('Rental dashboard data could not be loaded.', failed.error);
    const invoiceRows = invoices.data ?? [];
    const paid = (payments.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
    const paidByInvoice = new Map<string,number>();
    for (const payment of payments.data ?? []) paidByInvoice.set(payment.invoice_id,(paidByInvoice.get(payment.invoice_id) ?? 0)+Number(payment.amount));
    const outstanding = invoiceRows.filter(row => ['sent','partially_paid'].includes(row.status))
      .reduce((sum, row) => sum + Math.max(0,Number(row.total)-(paidByInvoice.get(row.id) ?? 0)), 0);
    const month = new Date().toISOString().slice(0, 7);
    const monthExpenses = (expenses.data ?? []).filter(row => row.expense_date.startsWith(month))
      .reduce((sum, row) => sum + Number(row.amount), 0);
    return {
      properties: properties.count ?? 0,
      units: units.data?.length ?? 0,
      occupiedUnits: (units.data ?? []).filter(row => row.status === 'occupied').length,
      activeTenancies: agreements.data?.length ?? 0,
      monthlyRentRunRate: (agreements.data ?? []).reduce((sum, row) => sum + Number(row.monthly_rent), 0),
      invoiced: invoiceRows.reduce((sum, row) => sum + Number(row.total), 0),
      collected: paid,
      outstanding: Math.max(0, roundMoney(outstanding)),
      pendingApproval: invoiceRows.filter(row => row.status === 'pending_approval').length,
      monthExpenses: monthExpenses,
    };
  });

export const listRentalProperties = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(workspaceInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId);
    const { data: rows, error } = await db(context.supabase).from('rental_properties')
      .select('id,name,address,city,state,postal_code,country,notes,is_active,created_at')
      .eq('workspace_id', data.workspaceId).order('name');
    if (error) fail('Properties could not be loaded.', error);
    return rows ?? [];
  });

const propertyInput = z.object({
  workspaceId: z.string().uuid(), id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160), address: z.string().max(400).optional().nullable(),
  city: z.string().max(100).optional().nullable(), state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(), country: z.string().max(80).default('India'),
  notes: z.string().max(1000).optional().nullable(),
});
export const saveRentalProperty = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(propertyInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId, ['owner','accountant']);
    const payload = { name: data.name, address: data.address || null, city: data.city || null, state: data.state || null, postal_code: data.postalCode || null, country: data.country, notes: data.notes || null };
    const query = data.id
      ? db(context.supabase).from('rental_properties').update(payload).eq('id', data.id).eq('workspace_id', data.workspaceId).select('id').single()
      : db(context.supabase).from('rental_properties').insert({ ...payload, workspace_id: data.workspaceId, created_by: context.userId }).select('id').single();
    const { data: row, error } = await query;
    if (error || !row) fail('Property could not be saved.', error ?? undefined);
    return { id: row.id as string };
  });

export const listRentalUnits = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(workspaceInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId);
    const { data: rows, error } = await db(context.supabase).from('rental_units')
      .select('id,property_id,unit_code,floor_label,status,monthly_rent,security_deposit,due_day,electricity_rate,notes')
      .eq('workspace_id', data.workspaceId).order('unit_code');
    if (error) fail('Rental units could not be loaded.', error);
    return rows ?? [];
  });

const unitInput = z.object({
  workspaceId: z.string().uuid(), id: z.string().uuid().optional(), propertyId: z.string().uuid(),
  unitCode: z.string().trim().min(1).max(60), floorLabel: z.string().max(60).optional().nullable(),
  status: z.enum(['vacant','occupied','maintenance']).default('vacant'),
  monthlyRent: money, securityDeposit: money.default(0), dueDay: z.number().int().min(1).max(28).default(15),
  electricityRate: money.default(0), notes: z.string().max(1000).optional().nullable(),
});
export const saveRentalUnit = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(unitInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId, ['owner','accountant']);
    if (data.id) {
      const { data: activeAgreement, error: agreementError } = await db(context.supabase).from('rental_agreements')
        .select('id').eq('workspace_id',data.workspaceId).eq('unit_id',data.id).eq('status','active').maybeSingle();
      if (agreementError) fail('Unit occupancy could not be verified.',agreementError);
      if (activeAgreement && data.status !== 'occupied') throw new Error('This unit has an active rental agreement and must remain occupied.');
      if (!activeAgreement && data.status === 'occupied') throw new Error('Activate a rental agreement before marking this unit occupied.');
    }
    const payload = { property_id: data.propertyId, unit_code: data.unitCode, floor_label: data.floorLabel || null, status: data.status, monthly_rent: data.monthlyRent, security_deposit: data.securityDeposit, due_day: data.dueDay, electricity_rate: data.electricityRate, notes: data.notes || null };
    const query = data.id
      ? db(context.supabase).from('rental_units').update(payload).eq('id', data.id).eq('workspace_id', data.workspaceId).select('id').single()
      : db(context.supabase).from('rental_units').insert({ ...payload, workspace_id: data.workspaceId, created_by: context.userId }).select('id').single();
    const { data: row, error } = await query;
    if (error || !row) fail('Rental unit could not be saved.', error ?? undefined);
    return { id: row.id as string };
  });

export const listRentalTenants = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(workspaceInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId);
    const { data: rows, error } = await db(context.supabase).from('rental_tenants')
      .select('id,full_name,phone,whatsapp_number,email,notes,status,created_at')
      .eq('workspace_id', data.workspaceId).order('full_name');
    if (error) fail('Tenants could not be loaded.', error);
    return rows ?? [];
  });

const tenantInput = z.object({
  workspaceId: z.string().uuid(), id: z.string().uuid().optional(),
  fullName: z.string().trim().min(1).max(160), phone: z.string().max(30).optional().nullable(),
  whatsappNumber: z.string().max(30).optional().nullable(), email: z.string().email().max(254).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(), status: z.enum(['active','inactive']).default('active'),
});
export const saveRentalTenant = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(tenantInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId, ['owner','accountant']);
    const payload = { full_name: data.fullName, phone: data.phone || null, whatsapp_number: data.whatsappNumber || null, email: data.email || null, notes: data.notes || null, status: data.status };
    const query = data.id
      ? db(context.supabase).from('rental_tenants').update(payload).eq('id', data.id).eq('workspace_id', data.workspaceId).select('id').single()
      : db(context.supabase).from('rental_tenants').insert({ ...payload, workspace_id: data.workspaceId, created_by: context.userId }).select('id').single();
    const { data: row, error } = await query;
    if (error || !row) fail('Tenant could not be saved.', error ?? undefined);
    return { id: row.id as string };
  });

export const listRentalAgreements = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(workspaceInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId);
    const [agreements, units, tenants, properties] = await Promise.all([
      db(context.supabase).from('rental_agreements').select('id,unit_id,tenant_id,agreement_ref,start_date,end_date,monthly_rent,security_deposit,due_day,status,notes').eq('workspace_id', data.workspaceId).order('start_date', { ascending: false }),
      db(context.supabase).from('rental_units').select('id,unit_code,property_id').eq('workspace_id', data.workspaceId),
      db(context.supabase).from('rental_tenants').select('id,full_name,phone').eq('workspace_id', data.workspaceId),
      db(context.supabase).from('rental_properties').select('id,name').eq('workspace_id', data.workspaceId),
    ]);
    const failed = [agreements,units,tenants,properties].find(r => r.error);
    if (failed?.error) fail('Rental agreements could not be loaded.', failed.error);
    const unitMap = new Map((units.data ?? []).map(r => [r.id, r]));
    const tenantMap = new Map((tenants.data ?? []).map(r => [r.id, r]));
    const propertyMap = new Map((properties.data ?? []).map(r => [r.id, r]));
    return (agreements.data ?? []).map(a => {
      const unit = unitMap.get(a.unit_id);
      return { ...a, unit_code: unit?.unit_code ?? '', property_name: propertyMap.get(unit?.property_id ?? '')?.name ?? '', tenant_name: tenantMap.get(a.tenant_id)?.full_name ?? '', tenant_phone: tenantMap.get(a.tenant_id)?.phone ?? '' };
    });
  });

const agreementInput = z.object({
  workspaceId: z.string().uuid(), id: z.string().uuid().optional(), unitId: z.string().uuid(), tenantId: z.string().uuid(),
  agreementRef: z.string().max(80).optional().nullable(), startDate: dateText, endDate: dateText.optional().nullable(),
  monthlyRent: money, securityDeposit: money.default(0), dueDay: z.number().int().min(1).max(28).default(15),
  status: z.enum(['active','ended','draft']).default('active'), notes: z.string().max(1000).optional().nullable(),
});
export const saveRentalAgreement = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(agreementInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId, ['owner','accountant']);
    if (data.id) {
      const { data: existing, error: existingError } = await db(context.supabase).from('rental_agreements')
        .select('unit_id,tenant_id').eq('workspace_id',data.workspaceId).eq('id',data.id).maybeSingle();
      if (existingError) fail('Existing agreement could not be loaded.',existingError);
      if (existing && (existing.unit_id !== data.unitId || existing.tenant_id !== data.tenantId)) {
        throw new Error('An active agreement cannot be moved to a different unit or tenant. End it and create a new agreement instead.');
      }
    }
    const payload = { unit_id: data.unitId, tenant_id: data.tenantId, agreement_ref: data.agreementRef || null, start_date: data.startDate, end_date: data.endDate || null, monthly_rent: data.monthlyRent, security_deposit: data.securityDeposit, due_day: data.dueDay, status: data.status, notes: data.notes || null };
    const query = data.id
      ? db(context.supabase).from('rental_agreements').update(payload).eq('id', data.id).eq('workspace_id', data.workspaceId).select('id').single()
      : db(context.supabase).from('rental_agreements').insert({ ...payload, workspace_id: data.workspaceId, created_by: context.userId }).select('id').single();
    const { data: row, error } = await query;
    if (error || !row) fail('Rental agreement could not be saved. A unit may already have an active agreement.', error ?? undefined);
    const { error: unitError } = await db(context.supabase).from('rental_units').update({ status: data.status === 'active' ? 'occupied' : 'vacant' }).eq('id', data.unitId).eq('workspace_id', data.workspaceId);
    if (unitError) fail('Agreement saved, but unit occupancy could not be updated.', unitError);
    return { id: row.id as string };
  });

export const listRentalChargeTypes = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(workspaceInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId);
    const { data: rows, error } = await db(context.supabase).from('rental_charge_types')
      .select('id,code,name,category,is_active').eq('workspace_id', data.workspaceId).order('name');
    if (error) fail('Additional charge types could not be loaded.', error);
    return rows ?? [];
  });

const chargeTypeInput = z.object({
  workspaceId: z.string().uuid(), id: z.string().uuid().optional(),
  code: z.string().trim().regex(/^[a-z0-9_]{2,40}$/), name: z.string().trim().min(1).max(100),
  category: z.enum(['water','maintenance','parking','cleaning','other']), isActive: z.boolean().default(true),
});
export const saveRentalChargeType = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(chargeTypeInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId, ['owner','accountant']);
    const payload = { code: data.code, name: data.name, category: data.category, is_active: data.isActive };
    const query = data.id
      ? db(context.supabase).from('rental_charge_types').update(payload).eq('id', data.id).eq('workspace_id', data.workspaceId).select('id').single()
      : db(context.supabase).from('rental_charge_types').insert({ ...payload, workspace_id: data.workspaceId, created_by: context.userId }).select('id').single();
    const { data: row, error } = await query;
    if (error || !row) fail('Charge type could not be saved.', error ?? undefined);
    return { id: row.id as string };
  });

export const listRentalChargeRules = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(workspaceInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId);
    const [rules, types, properties, units] = await Promise.all([
      db(context.supabase).from('rental_charge_rules').select('id,property_id,unit_id,charge_type_id,allocation_method,amount,allocation_percent,is_recurring,start_date,end_date,is_active,notes').eq('workspace_id', data.workspaceId).order('created_at', { ascending: false }),
      db(context.supabase).from('rental_charge_types').select('id,name,category').eq('workspace_id', data.workspaceId),
      db(context.supabase).from('rental_properties').select('id,name').eq('workspace_id', data.workspaceId),
      db(context.supabase).from('rental_units').select('id,unit_code').eq('workspace_id', data.workspaceId),
    ]);
    const failed = [rules,types,properties,units].find(r => r.error);
    if (failed?.error) fail('Additional charge rules could not be loaded.', failed.error);
    const typeMap = new Map((types.data ?? []).map(r => [r.id,r]));
    const propertyMap = new Map((properties.data ?? []).map(r => [r.id,r.name]));
    const unitMap = new Map((units.data ?? []).map(r => [r.id,r.unit_code]));
    return (rules.data ?? []).map(r => ({ ...r, charge_name: typeMap.get(r.charge_type_id)?.name ?? '', category: typeMap.get(r.charge_type_id)?.category ?? 'other', property_name: propertyMap.get(r.property_id) ?? '', unit_code: unitMap.get(r.unit_id ?? '') ?? 'All units' }));
  });

const chargeRuleInput = z.object({
  workspaceId: z.string().uuid(), id: z.string().uuid().optional(), propertyId: z.string().uuid(),
  unitId: z.string().uuid().optional().nullable(), chargeTypeId: z.string().uuid(),
  allocationMethod: z.enum(['fixed','equal','percentage']), amount: money,
  allocationPercent: z.number().min(0.0001).max(100).optional().nullable(),
  isRecurring: z.boolean().default(true), startDate: dateText, endDate: dateText.optional().nullable(),
  isActive: z.boolean().default(true), notes: z.string().max(500).optional().nullable(),
});
export const saveRentalChargeRule = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(chargeRuleInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId, ['owner','accountant']);
    if (data.allocationMethod === 'equal' && data.unitId) throw new Error('Equal sharing applies to all occupied units in a property.');
    if (data.allocationMethod !== 'equal' && !data.unitId) throw new Error('Select a unit for fixed or percentage allocation.');
    if (data.allocationMethod === 'percentage' && !data.allocationPercent) throw new Error('Enter the unit percentage share.');
    const payload = { property_id: data.propertyId, unit_id: data.unitId || null, charge_type_id: data.chargeTypeId, allocation_method: data.allocationMethod, amount: data.amount, allocation_percent: data.allocationMethod === 'percentage' ? data.allocationPercent : null, is_recurring: data.isRecurring, start_date: data.startDate, end_date: data.endDate || null, is_active: data.isActive, notes: data.notes || null };
    const query = data.id
      ? db(context.supabase).from('rental_charge_rules').update(payload).eq('id', data.id).eq('workspace_id', data.workspaceId).select('id').single()
      : db(context.supabase).from('rental_charge_rules').insert({ ...payload, workspace_id: data.workspaceId, created_by: context.userId }).select('id').single();
    const { data: row, error } = await query;
    if (error || !row) fail('Additional charge rule could not be saved.', error ?? undefined);
    return { id: row.id as string };
  });

export const listRentalMeterReadings = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(workspaceInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId);
    const { data: rows, error } = await db(context.supabase).from('rental_meter_readings')
      .select('id,unit_id,meter_type,period_start,period_end,previous_reading,current_reading,units_consumed,rate_per_unit,charge_amount,read_at,notes')
      .eq('workspace_id', data.workspaceId).order('period_end', { ascending: false });
    if (error) fail('Meter readings could not be loaded.', error);
    return rows ?? [];
  });

const meterInput = z.object({
  workspaceId: z.string().uuid(), id: z.string().uuid().optional(), unitId: z.string().uuid(),
  meterType: z.enum(['electricity','water']).default('electricity'), periodStart: dateText, periodEnd: dateText,
  previousReading: z.number().min(0), currentReading: z.number().min(0),
  ratePerUnit: z.number().min(0), readAt: dateText, notes: z.string().max(500).optional().nullable(),
}).refine(v => v.currentReading >= v.previousReading, { message: 'Current meter reading must not be lower than previous reading.' });
export const saveRentalMeterReading = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(meterInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId, ['owner','accountant']);
    const payload = { unit_id: data.unitId, meter_type: data.meterType, period_start: data.periodStart, period_end: data.periodEnd, previous_reading: data.previousReading, current_reading: data.currentReading, rate_per_unit: data.ratePerUnit, read_at: data.readAt, notes: data.notes || null };
    const query = data.id
      ? db(context.supabase).from('rental_meter_readings').update(payload).eq('id', data.id).eq('workspace_id', data.workspaceId).select('id').single()
      : db(context.supabase).from('rental_meter_readings').insert({ ...payload, workspace_id: data.workspaceId, recorded_by: context.userId }).select('id').single();
    const { data: row, error } = await query;
    if (error || !row) fail('Meter reading could not be saved. Check that this billing period has not already been entered.', error ?? undefined);
    return { id: row.id as string };
  });

const daysBetween = (start: string, end: string) => {
  const a = Date.parse(start + 'T00:00:00Z');
  const b = Date.parse(end + 'T00:00:00Z');
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
};
const dueDateFor = (periodStart: string, dueDay: number) => `${periodStart.slice(0,7)}-${String(dueDay).padStart(2,'0')}`;
export const generateRentalMonthlyInvoices = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ workspaceId: z.string().uuid(), periodStart: dateText, periodEnd: dateText, issueDate: dateText }))
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId, ['owner','accountant']);
    if (data.periodEnd < data.periodStart) throw new Error('Billing period is invalid.');
    const [agreements, units, tenants, readings, rules, types] = await Promise.all([
      db(context.supabase).from('rental_agreements').select('id,unit_id,tenant_id,start_date,end_date,monthly_rent,due_day').eq('workspace_id', data.workspaceId).eq('status','active').lte('start_date',data.periodEnd).or(`end_date.is.null,end_date.gte.${data.periodStart}`),
      db(context.supabase).from('rental_units').select('id,unit_code,property_id,electricity_rate').eq('workspace_id', data.workspaceId),
      db(context.supabase).from('rental_tenants').select('id,full_name').eq('workspace_id', data.workspaceId),
      db(context.supabase).from('rental_meter_readings').select('unit_id,meter_type,units_consumed,rate_per_unit,charge_amount').eq('workspace_id', data.workspaceId).eq('period_start',data.periodStart).eq('period_end',data.periodEnd),
      db(context.supabase).from('rental_charge_rules').select('id,property_id,unit_id,charge_type_id,allocation_method,amount,allocation_percent,is_recurring,start_date,end_date').eq('workspace_id',data.workspaceId).eq('is_active',true).lte('start_date',data.periodEnd).or(`end_date.is.null,end_date.gte.${data.periodStart}`),
      db(context.supabase).from('rental_charge_types').select('id,name,category').eq('workspace_id',data.workspaceId).eq('is_active',true),
    ]);
    const failed = [agreements,units,tenants,readings,rules,types].find(r => r.error);
    if (failed?.error) fail('Monthly billing inputs could not be loaded.', failed.error);
    const activeAgreements = agreements.data ?? [];
    if (!activeAgreements.length) return { generated: 0, invoiceIds: [] as string[] };
    const unitMap = new Map((units.data ?? []).map(r => [r.id,r]));
    const tenantMap = new Map((tenants.data ?? []).map(r => [r.id,r]));
    const typeMap = new Map((types.data ?? []).map(r => [r.id,r]));
    const agreementByProperty = new Map<string, typeof activeAgreements>();
    for (const agreement of activeAgreements) {
      const propertyId = unitMap.get(agreement.unit_id)?.property_id;
      if (!propertyId) continue;
      agreementByProperty.set(propertyId,[...(agreementByProperty.get(propertyId) ?? []),agreement]);
    }
    const invoiceIds: string[] = [];
    const sorted = [...activeAgreements].sort((a,b) => a.id.localeCompare(b.id));
    for (const agreement of sorted) {
      const unit = unitMap.get(agreement.unit_id);
      const tenant = tenantMap.get(agreement.tenant_id);
      if (!unit || !tenant) continue;
      const activeStart = agreement.start_date > data.periodStart ? agreement.start_date : data.periodStart;
      const activeEnd = agreement.end_date && agreement.end_date < data.periodEnd ? agreement.end_date : data.periodEnd;
      const activeDays = daysBetween(activeStart,activeEnd);
      const periodDays = daysBetween(data.periodStart,data.periodEnd);
      if (!activeDays || !periodDays) continue;
      const rentQuantity = Math.round((activeDays / periodDays) * 1000000) / 1000000;
      const lines: Array<{ charge_type_id?: string | null; description: string; category: string; quantity: number; unit_rate: number }> = [
        { description: `Monthly rent · ${unit.unit_code}`, category: 'rent', quantity: rentQuantity, unit_rate: Number(agreement.monthly_rent) },
      ];
      for (const reading of (readings.data ?? []).filter(r => r.unit_id === agreement.unit_id)) {
        const unitsUsed = Number(reading.units_consumed);
        const rate = unitsUsed > 0 ? Number(reading.rate_per_unit) : 0;
        lines.push({ description: `${reading.meter_type === 'electricity' ? 'Electricity' : 'Water meter'} · ${unitsUsed} units`, category: reading.meter_type, quantity: unitsUsed > 0 ? unitsUsed : 1, unit_rate: rate });
      }
      for (const rule of rules.data ?? []) {
        if (!rule.is_recurring && rule.start_date < data.periodStart) continue;
        const charge = typeMap.get(rule.charge_type_id);
        if (!charge) continue;
        let amount = 0;
        if (rule.allocation_method === 'equal' && !rule.unit_id && rule.property_id === unit.property_id) {
          const siblings = [...(agreementByProperty.get(rule.property_id) ?? [])].sort((a,b) => a.id.localeCompare(b.id));
          const index = siblings.findIndex(a => a.id === agreement.id);
          const base = roundMoney(Number(rule.amount) / Math.max(1,siblings.length));
          amount = index === siblings.length - 1
            ? roundMoney(Number(rule.amount) - base * Math.max(0,siblings.length - 1))
            : base;
        } else if (rule.unit_id === agreement.unit_id && rule.allocation_method === 'fixed') {
          amount = Number(rule.amount);
        } else if (rule.unit_id === agreement.unit_id && rule.allocation_method === 'percentage') {
          amount = roundMoney(Number(rule.amount) * Number(rule.allocation_percent) / 100);
        }
        if (amount > 0) lines.push({ charge_type_id: rule.charge_type_id, description: charge.name, category: charge.category, quantity: 1, unit_rate: amount });
      }
      const dueDate = dueDateFor(data.periodStart,Number(agreement.due_day));
      const { data: invoiceId, error } = await db(context.supabase).rpc('create_rental_invoice', {
        _workspace: data.workspaceId, _tenant: agreement.tenant_id, _unit: agreement.unit_id, _agreement: agreement.id,
        _period_start: data.periodStart, _period_end: data.periodEnd, _issue_date: data.issueDate,
        _due_date: dueDate, _notes: 'Monthly rent and utility charges · review before approval',
        _lines: lines,
      });
      if (error || !invoiceId) fail(`Invoice could not be generated for ${tenant.full_name}.`, error ?? undefined);
      invoiceIds.push(invoiceId as string);
    }
    return { generated: invoiceIds.length, invoiceIds };
  });

export const listRentalInvoices = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(workspaceInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase, data.workspaceId);
    const { data: invoices, error } = await db(context.supabase).from('rental_invoices')
      .select('id,invoice_number,tenant_id,unit_id,billing_period_start,billing_period_end,issue_date,due_date,total,status,notes,approved_at,sent_at,created_at')
      .eq('workspace_id',data.workspaceId).neq('status','void').order('created_at',{ascending:false});
    if (error) fail('Rental invoices could not be loaded.', error);
    const [tenants,units,lines,payments] = await Promise.all([
      db(context.supabase).from('rental_tenants').select('id,full_name,whatsapp_number,phone').eq('workspace_id',data.workspaceId),
      db(context.supabase).from('rental_units').select('id,unit_code').eq('workspace_id',data.workspaceId),
      db(context.supabase).from('rental_invoice_lines').select('id,invoice_id,description,category,quantity,unit_rate,amount').eq('workspace_id',data.workspaceId),
      db(context.supabase).from('rental_payments').select('invoice_id,amount,payment_date,payment_method,reference').eq('workspace_id',data.workspaceId),
    ]);
    const failed = [tenants,units,lines,payments].find(r => r.error);
    if (failed?.error) fail('Invoice details could not be loaded.', failed.error);
    const tenantMap = new Map((tenants.data ?? []).map(r => [r.id,r]));
    const unitMap = new Map((units.data ?? []).map(r => [r.id,r]));
    return (invoices ?? []).map(i => ({
      ...i, tenant: tenantMap.get(i.tenant_id), unit: unitMap.get(i.unit_id),
      lines: (lines.data ?? []).filter(l => l.invoice_id === i.id),
      payments: (payments.data ?? []).filter(p => p.invoice_id === i.id),
    }));
  });

export const approveRentalInvoice = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(z.object({ workspaceId:z.string().uuid(), invoiceId:z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase,data.workspaceId,['owner']);
    const { error } = await db(context.supabase).rpc('approve_rental_invoice',{_workspace:data.workspaceId,_invoice:data.invoiceId});
    if (error) fail('Invoice approval failed.',error);
    return { ok:true };
  });

export const markRentalInvoiceSent = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(z.object({ workspaceId:z.string().uuid(), invoiceId:z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase,data.workspaceId,['owner']);
    const { error } = await db(context.supabase).rpc('mark_rental_invoice_sent',{_workspace:data.workspaceId,_invoice:data.invoiceId});
    if (error) fail('Invoice could not be marked as sent.',error);
    return { ok:true };
  });

export const recordRentalPayment = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ workspaceId:z.string().uuid(),invoiceId:z.string().uuid(),amount:z.number().positive().max(999999999),paymentDate:dateText,paymentMethod:z.enum(['cash','bank_transfer','upi','qr','cheque','other']),reference:z.string().max(120).optional().nullable(),notes:z.string().max(500).optional().nullable() }))
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase,data.workspaceId,['owner','accountant']);
    const { data: id, error } = await db(context.supabase).rpc('record_rental_payment',{
      _workspace:data.workspaceId,_invoice:data.invoiceId,_amount:data.amount,_date:data.paymentDate,
      _method:data.paymentMethod,_reference:data.reference || null,_notes:data.notes || null,
    });
    if (error || !id) fail('Payment could not be recorded.',error ?? undefined);
    return { id:id as string };
  });

export const listRentalExpenses = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(workspaceInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase,data.workspaceId);
    const { data: rows,error } = await db(context.supabase).from('rental_expenses')
      .select('id,property_id,unit_id,category,description,amount,expense_date,payment_method,reference,notes')
      .eq('workspace_id',data.workspaceId).order('expense_date',{ascending:false});
    if (error) fail('Rental expenses could not be loaded.',error);
    return rows ?? [];
  });

const expenseInput = z.object({
  workspaceId:z.string().uuid(),id:z.string().uuid().optional(),propertyId:z.string().uuid(),unitId:z.string().uuid().optional().nullable(),
  category:z.enum(['repairs','maintenance','utilities','taxes','insurance','cleaning','other']),
  description:z.string().trim().min(1).max(180),amount:z.number().positive().max(999999999),expenseDate:dateText,
  paymentMethod:z.enum(['cash','bank_transfer','upi','qr','cheque','other']).optional().nullable(),
  reference:z.string().max(120).optional().nullable(),notes:z.string().max(1000).optional().nullable(),
});
export const saveRentalExpense = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(expenseInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase,data.workspaceId,['owner','accountant']);
    const payload = { property_id:data.propertyId,unit_id:data.unitId || null,category:data.category,description:data.description,amount:data.amount,expense_date:data.expenseDate,payment_method:data.paymentMethod || null,reference:data.reference || null,notes:data.notes || null };
    const query = data.id
      ? db(context.supabase).from('rental_expenses').update(payload).eq('id',data.id).eq('workspace_id',data.workspaceId).select('id').single()
      : db(context.supabase).from('rental_expenses').insert({...payload,workspace_id:data.workspaceId,created_by:context.userId}).select('id').single();
    const { data: row,error } = await query;
    if (error || !row) fail('Rental expense could not be saved.',error ?? undefined);
    return { id:row.id as string };
  });

export const listRentalMembers = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(workspaceInput)
  .handler(async ({ data, context }) => {
    const role = await rentalRole(context.supabase,data.workspaceId);
    const { data: rows,error } = await db(context.supabase).from('rental_memberships')
      .select('id,user_id,role,status,profiles!rental_memberships_user_id_fkey(full_name,employee_id)')
      .eq('workspace_id',data.workspaceId).order('created_at');
    if (error) fail('Rental team could not be loaded.',error);
    return { role, members:rows ?? [] };
  });

export const listRentalMemberCandidates = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(workspaceInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase,data.workspaceId,['owner']);
    const [profiles,members] = await Promise.all([
      db(context.supabase).from('profiles').select('id,full_name,employee_id').order('full_name'),
      db(context.supabase).from('rental_memberships').select('user_id').eq('workspace_id',data.workspaceId).eq('status','active'),
    ]);
    if (profiles.error || members.error) fail('Existing employee accounts could not be loaded.',profiles.error ?? members.error ?? undefined);
    const assigned = new Set((members.data ?? []).map(m => m.user_id));
    return (profiles.data ?? []).filter(p => !assigned.has(p.id));
  });

export const assignRentalMember = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ workspaceId:z.string().uuid(),userId:z.string().uuid(),role:z.enum(['accountant','viewer']) }))
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase,data.workspaceId,['owner']);
    const { data: id,error } = await db(context.supabase).rpc('assign_rental_member',{_workspace:data.workspaceId,_user:data.userId,_role:data.role});
    if (error || !id) fail('Existing employee account could not be assigned.',error ?? undefined);
    return { id:id as string };
  });

export const listRentalDeposits = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(workspaceInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase,data.workspaceId);
    const { data: rows,error } = await db(context.supabase).from('rental_deposit_transactions')
      .select('id,tenant_id,unit_id,transaction_type,amount,transaction_date,payment_method,reference,notes')
      .eq('workspace_id',data.workspaceId).order('transaction_date',{ascending:false});
    if (error) fail('Security deposit history could not be loaded.',error);
    return rows ?? [];
  });

const depositInput = z.object({
  workspaceId:z.string().uuid(),tenantId:z.string().uuid(),unitId:z.string().uuid(),agreementId:z.string().uuid().optional().nullable(),
  transactionType:z.enum(['received','refunded','adjustment']),amount:z.number().positive().max(999999999),transactionDate:dateText,
  paymentMethod:z.enum(['cash','bank_transfer','upi','qr','cheque','other']).optional().nullable(),
  reference:z.string().max(120).optional().nullable(),notes:z.string().max(500).optional().nullable(),
});
export const recordRentalDeposit = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(depositInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase,data.workspaceId,['owner','accountant']);
    const { data: row,error } = await db(context.supabase).from('rental_deposit_transactions').insert({
      workspace_id:data.workspaceId,tenant_id:data.tenantId,unit_id:data.unitId,agreement_id:data.agreementId || null,
      transaction_type:data.transactionType,amount:data.amount,transaction_date:data.transactionDate,
      payment_method:data.paymentMethod || null,reference:data.reference || null,notes:data.notes || null,recorded_by:context.userId,
    }).select('id').single();
    if (error || !row) fail('Security deposit transaction could not be recorded.',error ?? undefined);
    return { id:row.id as string };
  });

export const listRentalAuditEvents = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(workspaceInput)
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase,data.workspaceId,['owner']);
    const { data: rows,error } = await db(context.supabase).from('rental_audit_events')
      .select('id,actor_id,entity_table,entity_id,action,before_data,after_data,created_at')
      .eq('workspace_id',data.workspaceId).order('created_at',{ascending:false}).limit(200);
    if (error) fail('Rental audit history could not be loaded.',error);
    return rows ?? [];
  });

export const getRentalAnnualReport = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ workspaceId: z.string().uuid(), year: z.number().int().min(2000).max(2100) }))
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase,data.workspaceId);
    const from = `${data.year}-01-01`;
    const to = `${data.year+1}-01-01`;
    const [invoices,payments,expenses] = await Promise.all([
      db(context.supabase).from('rental_invoices').select('billing_period_start,total,status').eq('workspace_id',data.workspaceId).neq('status','void').gte('billing_period_start',from).lt('billing_period_start',to),
      db(context.supabase).from('rental_payments').select('payment_date,amount').eq('workspace_id',data.workspaceId).gte('payment_date',from).lt('payment_date',to),
      db(context.supabase).from('rental_expenses').select('expense_date,amount,category').eq('workspace_id',data.workspaceId).gte('expense_date',from).lt('expense_date',to),
    ]);
    const failed = [invoices,payments,expenses].find(r=>r.error);
    if (failed?.error) fail('Rental annual report could not be loaded.',failed.error);
    const months = Array.from({length:12},(_,index)=>({
      month:index+1,
      label:new Date(Date.UTC(data.year,index,1)).toLocaleString('en-IN',{month:'short',timeZone:'UTC'}),
      invoiced:0, collected:0, expenses:0, netCash:0,
    }));
    for (const row of invoices.data??[]) months[Number(row.billing_period_start.slice(5,7))-1].invoiced += Number(row.total);
    for (const row of payments.data??[]) months[Number(row.payment_date.slice(5,7))-1].collected += Number(row.amount);
    for (const row of expenses.data??[]) months[Number(row.expense_date.slice(5,7))-1].expenses += Number(row.amount);
    for (const month of months) {
      month.invoiced=roundMoney(month.invoiced);
      month.collected=roundMoney(month.collected);
      month.expenses=roundMoney(month.expenses);
      month.netCash=roundMoney(month.collected-month.expenses);
    }
    return {
      year:data.year, months,
      invoiced:roundMoney(months.reduce((s,m)=>s+m.invoiced,0)),
      collected:roundMoney(months.reduce((s,m)=>s+m.collected,0)),
      expenses:roundMoney(months.reduce((s,m)=>s+m.expenses,0)),
      netCash:roundMoney(months.reduce((s,m)=>s+m.netCash,0)),
    };
  });

export const deactivateRentalMember = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ workspaceId:z.string().uuid(),memberId:z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await rentalRole(context.supabase,data.workspaceId,['owner']);
    const { data: ok,error } = await db(context.supabase).rpc('deactivate_rental_member',{_workspace:data.workspaceId,_member:data.memberId});
    if (error || !ok) fail('Rental member access could not be revoked.',error ?? undefined);
    return { ok:true };
  });
