import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { receiptOperationId } from './sheet-stock-in';

const input = z.object({
  businessId: z.string().uuid(),
  branchId: z.string().uuid(),
  importHash: z.string().regex(/^[a-f0-9]{64}$/),
  rows: z.array(z.object({ sku: z.string().trim().min(1).max(64), quantity: z.number().int().min(1).max(1_000_000) })).min(1).max(5000),
});
export type AuraFinalImportReport = { applied: number; alreadyApplied: number; failed: number; issues: string[] };

/** Posts Aura Final as append-only stock receipts. Same file + SKU is idempotent on retries. */
export const importAuraFinalStock = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input).handler(async ({ data, context }): Promise<AuraFinalImportReport> => {
  const { supabase } = context;
  const [member, accountant, platformOwner] = await Promise.all([
    supabase.rpc('is_business_member', { _business_id: data.businessId }),
    supabase.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'accountant' }),
    supabase.rpc('is_platform_owner'),
  ]);
  if (member.error || accountant.error || platformOwner.error || (!member.data && !platformOwner.data) || (!accountant.data && !platformOwner.data)) throw new Error('Authorised Auraluxe accountant access is required to import stock.');
  const branch = await supabase.from('branches').select('id').eq('business_id', data.businessId).eq('id', data.branchId).eq('is_active', true).maybeSingle();
  if (branch.error || !branch.data) throw new Error('Select an active branch belonging to this business.');
  const skuCounts = new Map<string, number>();
  for (const row of data.rows) skuCounts.set(row.sku.toLowerCase(), (skuCounts.get(row.sku.toLowerCase()) ?? 0) + 1);
  if ([...skuCounts.values()].some(n => n > 1)) throw new Error('The import contains duplicate SKUs. Fix the file and preview it again.');
  const report: AuraFinalImportReport = { applied: 0, alreadyApplied: 0, failed: 0, issues: [] };
  const variantsBySku = new Map<string, string[]>();
  for (let offset = 0; ; offset += 1000) {
    const page = await supabase.from('product_variants').select('id,sku,products!product_variants_business_id_product_id_fkey(is_active)').eq('business_id', data.businessId).eq('is_active', true).order('id').range(offset, offset + 999);
    if (page.error) throw new Error('BizSathi products could not be checked.');
    for (const v of page.data ?? []) {
      if ((v.products as { is_active: boolean } | null)?.is_active === false) continue;
      const key = v.sku.trim().toLowerCase();
      variantsBySku.set(key, [...(variantsBySku.get(key) ?? []), v.id]);
    }
    if ((page.data?.length ?? 0) < 1000) break;
  }
  for (const row of data.rows) {
    const matches = variantsBySku.get(row.sku.toLowerCase()) ?? [];
    if (matches.length !== 1) { report.failed++; report.issues.push(`${row.sku}: ${matches.length ? 'matches multiple active variants' : 'SKU is not present in active BizSathi products'}`); continue; }
    const variantId = matches[0]!;
    const reference = `Aura Final Import ${data.importHash.slice(0, 32)} ${row.sku}`.slice(0, 200);
    const existing = await supabase.from('stock_movements').select('variant_id,branch_id,quantity').eq('business_id', data.businessId).eq('reference', reference).eq('kind', 'receive').limit(2);
    if (existing.error) throw new Error('Existing stock receipts could not be checked. No new stock was posted for this row.');
    const found = existing.data?.[0];
    if (found) {
      if (found.variant_id === variantId && found.branch_id === data.branchId && Number(found.quantity) === row.quantity) report.alreadyApplied++;
      else { report.failed++; report.issues.push(`${row.sku}: an import receipt already exists with different details or branch; no change made`); }
      continue;
    }
    try {
      const id = await receiptOperationId(data.businessId, `aura-final:${data.importHash}:${row.sku.toLowerCase()}`);
      const posted = await supabase.rpc('post_stock_request', { _request: { businessId: data.businessId, id, variantId, branchId: data.branchId, destinationBranchId: null, kind: 'receive', quantity: row.quantity, reference, reason: `Aura Final CSV import ${data.importHash.slice(0, 16)}` } });
      if (posted.error) throw new Error(posted.error.message);
      report.applied++;
    } catch {
      const retry = await supabase.from('stock_movements').select('variant_id,branch_id,quantity').eq('business_id', data.businessId).eq('reference', reference).eq('kind', 'receive').limit(1);
      if (retry.data?.[0] && retry.data[0].variant_id === variantId && retry.data[0].branch_id === data.branchId && Number(retry.data[0].quantity) === row.quantity) report.alreadyApplied++;
      else { report.failed++; report.issues.push(`${row.sku}: stock receipt was not confirmed; check stock history before retrying`); }
    }
  }
  return report;
});
