import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (client: unknown) => client as SupabaseClient<any, 'public', any>;
const business = z.object({ businessId: z.string().uuid() });

export const listFiscalYears = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(business).handler(async ({ data, context }) => {
  const r = await db(context.supabase).from('financial_periods').select('id,name,start_date,end_date,status,closed_at').eq('business_id', data.businessId).order('start_date', { ascending: false });
  if (r.error) throw new Error('Financial years could not be loaded.');
  return (r.data ?? []) as { id: string; name: string; start_date: string; end_date: string; status: 'open' | 'closed' | 'locked'; closed_at: string | null }[];
});

// The database function enforces who may do what: accountant closes, admin reopens, owner locks.
export const setFiscalYearStatus = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ periodId: z.string().uuid(), status: z.enum(['open', 'closed', 'locked']) })).handler(async ({ data, context }) => {
    const r = await db(context.supabase).rpc('set_financial_period_status', { _period_id: data.periodId, _status: data.status });
    if (r.error) throw new Error(r.error.code === '42501' ? r.error.message : 'The financial year could not be updated.');
    return { ok: true };
  });

export const archiveBusinessFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(business).handler(async ({ data, context }) => {
  const r = await db(context.supabase).rpc('archive_business', { _business_id: data.businessId });
  if (r.error) throw new Error(r.error.code === '42501' ? r.error.message : 'The business could not be archived.');
  return { ok: true };
});
