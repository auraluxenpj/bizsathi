/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';

const db = (client: unknown) => client as SupabaseClient<any, 'public', any>;
const uuid = z.string().uuid();
const tenant = z.object({ businessId: uuid });
const draftInput = tenant.extend({
  employeeNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/),
  fullName: z.string().trim().min(2).max(120),
  branchId: uuid.nullable().optional(),
  department: z.string().trim().max(100).optional(),
  designation: z.string().trim().max(100).optional(),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  email: z.string().trim().email().max(254).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional(),
  responsibilities: z.array(z.string().trim().min(2).max(100)).max(40).optional(),
});

async function requireHrManager(client: SupabaseClient<any, 'public', any>, businessId: string) {
  const { data, error } = await client.rpc('hr_is_manager', { _business_id: businessId });
  if (error || !data) throw new Error('Only an HR administrator can manage draft employee profiles.');
}

export const getHrmDraftEmployees = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(tenant)
  .handler(async ({ data, context }) => {
    const client = db(context.supabase);
    await requireHrManager(client, data.businessId);
    const { data: rows, error } = await client.from('hr_employee_drafts').select('*')
      .eq('business_id', data.businessId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message || 'Draft employee profiles could not be loaded. Verify HRM migration 0067 and your HR administrator access.');
    return rows ?? [];
  });

export const createHrmDraftEmployee = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(draftInput)
  .handler(async ({ data, context }) => {
    const client = db(context.supabase);
    await requireHrManager(client, data.businessId);
    const { data: row, error } = await client.from('hr_employee_drafts').insert({
      business_id: data.businessId, branch_id: data.branchId ?? null,
      employee_number: data.employeeNumber, full_name: data.fullName,
      department: data.department || null, designation: data.designation || null,
      joining_date: data.joiningDate || null, email: data.email || null, phone: data.phone || null,
      responsibilities: data.responsibilities ?? [], profile_status: 'draft', created_by: context.userId,
    }).select('id').single();
    if (error || !row) {
      if (error?.code === '23505') throw new Error('This employee number is already used in this business. Choose a different number.');
      if (error?.code === '23503') throw new Error('The selected branch is not part of this business. Choose a valid branch or Unassigned.');
      if (error?.code === '42501' || error?.code === 'PGRST301') throw new Error('Your account does not have HR administrator permission for this business.');
      throw new Error(error?.message || 'Draft employee profile could not be saved. Check the employee number and branch.');
    }
    return { id: row.id as string };
  });
