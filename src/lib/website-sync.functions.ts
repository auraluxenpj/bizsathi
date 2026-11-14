import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { callWebsite } from './website-sync.server';
import { AURALUXE_BUSINESS_ID, compareStock, eligibleStock, localSnapshot, websiteState } from './website-sync';

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
  const { performWebsiteSync } = await import('./website-sync.run.server');
  return performWebsiteSync(context.supabase, data.branchId);
});
