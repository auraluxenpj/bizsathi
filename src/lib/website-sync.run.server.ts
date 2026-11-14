import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { callWebsite } from './website-sync.server';
import { AURALUXE_BUSINESS_ID, localSnapshot, runWebsiteSync, type SyncReport } from './website-sync';

/** One leased website sync run (website sales in, BizSathi counts out). Shared by the manual button and the sheet sync. */
export async function performWebsiteSync(supabase: SupabaseClient<Database>, branchId: string): Promise<SyncReport> {
  const lease = crypto.randomUUID();
  const start = await supabase.rpc('begin_website_stock_sync', { _business_id: AURALUXE_BUSINESS_ID, _branch_id: branchId, _lease_id: lease });
  if (start.error) throw new Error('Sync could not start. Check administrator access, linked branch, or another sync in progress.');
  try {
    return await runWebsiteSync({
      snapshot: async () => {
        const r = await supabase.rpc('read_website_stock_snapshot', { _business_id: AURALUXE_BUSINESS_ID, _branch_id: branchId });
        if (r.error) throw new Error('Branch inventory could not be read.');
        return localSnapshot.parse(r.data);
      },
      call: callWebsite,
      record: async ack => {
        const r = await supabase.rpc('record_website_stock_ack', { _business_id: AURALUXE_BUSINESS_ID, _branch_id: branchId, _lease_id: lease, _ack_id: ack.id, _sku: ack.sku, _delta: ack.delta });
        if (r.error) throw new Error('Adjustment not confirmed.');
        return r.data;
      },
    });
  } finally { await supabase.rpc('end_website_stock_sync', { _business_id: AURALUXE_BUSINESS_ID, _lease_id: lease }); }
}
