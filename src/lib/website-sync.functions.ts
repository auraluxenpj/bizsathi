import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { callWebsite } from './website-sync.server';
import { AURALUXE_BUSINESS_ID, compareStock, eligibleStock, localSnapshot, runWebsiteSync, websiteState } from './website-sync';

const input = z.object({ businessId: z.literal(AURALUXE_BUSINESS_ID), branchId: z.string().uuid() });
export const compareWebsiteStock = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input).handler(async ({ data, context }) => {
  const snapshot = await context.supabase.rpc('read_website_stock_snapshot', { _business_id: data.businessId, _branch_id: data.branchId });
  if (snapshot.error) throw new Error('Auraluxe administrator and active branch access are required.');
  const binding = await context.supabase.from('website_stock_sync').select('branch_id').eq('business_id', data.businessId).maybeSingle();
  if (binding.error) throw new Error('Website connection could not be checked.');
  if (binding.data && binding.data.branch_id !== data.branchId) throw new Error('Select the branch already linked to the website.');
  const local = eligibleStock(localSnapshot.parse(snapshot.data));
  const remote = local.valid.length ? websiteState.parse(await callWebsite({ action: 'state', skus: local.valid.map(r => r.sku) })).items : [];
  return { rows: compareStock(local.valid, remote), issues: local.issues, boundBranch: binding.data?.branch_id ?? null };
});
export const syncWebsiteStock = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input.extend({ confirmed: z.literal(true) })).handler(async ({ data, context }) => {
  const lease = crypto.randomUUID();
  const start = await context.supabase.rpc('begin_website_stock_sync', { _business_id: data.businessId, _branch_id: data.branchId, _lease_id: lease });
  if (start.error) throw new Error('Sync could not start. Check administrator access, linked branch, or another sync in progress.');
  try {
    return await runWebsiteSync({
      snapshot: async () => {
        const r = await context.supabase.rpc('read_website_stock_snapshot', { _business_id: data.businessId, _branch_id: data.branchId });
        if (r.error) throw new Error('Branch inventory could not be read.');
        return localSnapshot.parse(r.data);
      },
      call: callWebsite,
      record: async ack => {
        const r = await context.supabase.rpc('record_website_stock_ack', { _business_id: data.businessId, _branch_id: data.branchId, _lease_id: lease, _ack_id: ack.id, _sku: ack.sku, _delta: ack.delta });
        if (r.error) throw new Error('Adjustment not confirmed.');
        return r.data;
      },
    });
  } finally { await context.supabase.rpc('end_website_stock_sync', { _business_id: data.businessId, _lease_id: lease }); }
});