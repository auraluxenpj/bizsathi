import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { defaultCatalogueSpreadsheet } from './google-sheet-catalogue';
import { AURALUXE_BUSINESS_ID, type SyncReport } from './website-sync';
import { applyStockIn, parseStockInValues, STOCK_IN_SHEET, type StockInReport } from './sheet-stock-in';

const input = z.object({
  businessId: z.literal(AURALUXE_BUSINESS_ID),
  branchId: z.string().uuid(),
  spreadsheetIdOrUrl: z.string().trim().min(1).max(2048).default(defaultCatalogueSpreadsheet),
  /** Also run the website sync afterwards so the new counts reach the website in the same run. */
  includeWebsite: z.boolean().default(true),
  confirmed: z.literal(true),
});
export type SheetSyncResult = { stockIn: StockInReport; website: SyncReport | null; sheetStatusUpdated: boolean; sheetIssues: string[] };

/** Sheet "Stock In" -> BizSathi ledger -> website. Safe to run repeatedly: every receipt posts at most once. */
export const syncSheetStock = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input).handler(async ({ data, context }): Promise<SheetSyncResult> => {
  const { supabase } = context;
  const admin = await supabase.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'admin' });
  if (admin.error || !admin.data) throw new Error('Administrator access to Auraluxe is required.');
  const binding = await supabase.from('website_stock_sync').select('branch_id').eq('business_id', data.businessId).maybeSingle();
  if (binding.error) throw new Error('Website connection could not be checked.');
  if (binding.data && binding.data.branch_id !== data.branchId) throw new Error('Select the branch already linked to the website.');

  const { readSheetValues, writeStatusCells } = await import('./google-sheet-values.server');
  const credentials = { gatewayKey: process.env['LOVABLE_API_KEY'], connectionKey: process.env['GOOGLE_SHEETS_API_KEY'] };
  let values: string[][];
  try { values = await readSheetValues(data.spreadsheetIdOrUrl, STOCK_IN_SHEET, credentials); }
  catch (error) { throw new Error(error instanceof Error && error.name !== 'TimeoutError' && error.name !== 'TypeError' ? error.message : 'Google Sheets could not be reached. Check the URL and try again.'); }
  const parsed = parseStockInValues(values);

  const variantsBySku = new Map<string, string[]>();
  for (let offset = 0; ; offset += 1000) {
    const page = await supabase.from('product_variants').select('id,sku,products!product_variants_business_id_product_id_fkey(is_active)').eq('business_id', data.businessId).eq('is_active', true).order('id').range(offset, offset + 999);
    if (page.error) throw new Error('Products could not be loaded.');
    for (const v of page.data ?? []) { const active = (v.products as { is_active: boolean } | null)?.is_active; if (active === false) continue; const k = v.sku.trim().toLowerCase(); variantsBySku.set(k, [...(variantsBySku.get(k) ?? []), v.id]); }
    if ((page.data?.length ?? 0) < 1000) break;
  }
  const stockIn = await applyStockIn(parsed.receipts, {
    businessId: data.businessId, variantsBySku,
    existing: async reference => {
      const r = await supabase.from('stock_movements').select('variant_id,quantity').eq('business_id', data.businessId).eq('reference', reference).eq('kind', 'receive').limit(2);
      if (r.error) throw new Error('Stock history could not be checked.');
      return r.data?.[0] ? { variantId: r.data[0].variant_id, quantity: Number(r.data[0].quantity) } : null;
    },
    post: async req => {
      const r = await supabase.rpc('post_stock_request', { _request: { businessId: data.businessId, id: req.id, variantId: req.variantId, branchId: data.branchId, destinationBranchId: null, kind: 'receive', quantity: req.quantity, reference: req.reference, reason: req.reason } });
      if (r.error) throw new Error('Stock was not confirmed.');
    },
  });
  if (parsed.issues.length) { stockIn.issues.unshift(...parsed.issues); stockIn.failed += parsed.issues.length; }

  let website: SyncReport | null = null;
  if (data.includeWebsite) { const { performWebsiteSync } = await import('./website-sync.run.server'); website = await performWebsiteSync(supabase, data.branchId); }

  // Mark the sheet for people to read. This is cosmetic: the BizSathi ledger and the website's own state decide what was applied.
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const failedIds = new Set(stockIn.issues.map(i => i.split(':')[0]));
  const blockedSkus = new Set((website?.issues ?? []).map(i => i.split(':')[0]?.toLowerCase()));
  const updates: { row: number; bizsathi?: string; website?: string }[] = [];
  for (const r of parsed.receipts) {
    if (failedIds.has(r.receiptId)) continue;
    const u: { row: number; bizsathi?: string; website?: string } = { row: r.row };
    if (!r.appliedInBizsathi) u.bizsathi = stamp;
    if (website && !website.error && !r.appliedOnWebsite && !blockedSkus.has(r.sku.toLowerCase())) u.website = stamp;
    if (u.bizsathi || u.website) updates.push(u);
  }
  const sheetStatusUpdated = await writeStatusCells(data.spreadsheetIdOrUrl, STOCK_IN_SHEET, updates, credentials);
  return { stockIn, website, sheetStatusUpdated, sheetIssues: parsed.issues };
});
