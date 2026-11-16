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

export const getPlatformOwnerStatusFn = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const r = await db(context.supabase).rpc('is_platform_owner');
  if (r.error) throw new Error('Platform access could not be checked.');
  return Boolean(r.data);
});

export const requestBusinessArchiveFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ businessId: z.string().uuid(), reason: z.string().trim().min(1).max(1000) }))
  .handler(async ({ data, context }) => {
    const r = await db(context.supabase).rpc('request_business_archive', { _business_id: data.businessId, _reason: data.reason });
    if (r.error) throw new Error(r.error.message || 'The archive request could not be submitted.');
    return { requestId: r.data as string };
  });

export const listBusinessArchiveRequestsFn = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth])
  .inputValidator(business).handler(async ({ data, context }) => {
    const r = await db(context.supabase).rpc('list_business_archive_requests', { _business_id: data.businessId });
    if (r.error) throw new Error('Archive requests could not be loaded.');
    return (r.data ?? []) as { id: string; business_id: string; requested_by: string; request_reason: string; status: 'pending' | 'approved' | 'rejected'; reviewed_by: string | null; review_note: string | null; created_at: string; reviewed_at: string | null }[];
  });

export const reviewBusinessArchiveRequestFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ requestId: z.string().uuid(), approve: z.boolean(), note: z.string().max(1000).optional() }))
  .handler(async ({ data, context }) => {
    const r = await db(context.supabase).rpc('review_business_archive_request', { _request_id: data.requestId, _approve: data.approve, _review_note: data.note ?? null });
    if (r.error) throw new Error(r.error.message || 'The archive request could not be reviewed.');
    return { ok: true };
  });
