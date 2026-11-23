/**
 * Pure planning layer for the Auraluxe Google Sheets → BizSathi manual sync.
 *
 * This module deliberately does not perform database writes. It creates an
 * exact-SKU review plan which a later approval-gated server workflow can use.
 * Model Code is descriptive metadata only and is never an identity key.
 */
export const AURALUXE_SYNC_BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';

/**
 * These records are outside the scope of this integration. Filter them before
 * constructing previews, reports, or write candidates.
 */
const EXCLUDED_SKUS = new Set([
  'AL-PARTYWEAR-736',
  'AL-PARTYWEAR-737',
  'al001',
]);

export type SheetCatalogueRow = {
  sku: string;
  product_name: string;
  category: string;
  variant_name: string;
  model_code?: string | null;
  barcode?: string | null;
  unit: string;
  selling_price: number;
  purchase_price: number;
  mrp: number;
  wholesale_price: number;
  reorder_level: number;
  opening_stock: number;
};

export type BizSathiCatalogueRow = {
  id: string;
  product_id: string;
  sku: string;
  product_name: string;
  category: string | null;
  variant_name: string;
  model_code: string | null;
  barcode: string | null;
  unit: string;
  selling_price: number;
  purchase_price: number;
  mrp: number;
  wholesale_price: number;
  reorder_level: number;
  is_active: boolean;
};

export type CatalogueFieldPatch = Omit<SheetCatalogueRow, 'sku' | 'opening_stock' | 'model_code'> & {
  model_code: string | null;
};

export type CatalogueSyncPlan = {
  /** Exact-SKU matches eligible for field review; SKU itself is never patched. */
  updates: { sku: string; variantId: string; productId: string; fields: CatalogueFieldPatch }[];
  /** Sheet SKUs with no existing BizSathi match; these are insert candidates only. */
  inserts: SheetCatalogueRow[];
  /** Existing BizSathi SKUs absent from Master. They are preserved, never deactivated. */
  extraBizSathi: { sku: string; variantId: string; active: boolean }[];
  /** Rows that cannot safely be acted on until the source data is corrected. */
  issues: { source: 'Master' | 'BizSathi'; reason: 'blank_sku' | 'duplicate_sku'; rowCount: number }[];
  /** Opening quantities are surfaced separately; this plan never applies stock. */
  openingBaseline: { sku: string; quantity: number; variantId: string | null }[];
  /** Number of rows omitted by the explicit exclusion list; no row details are exposed. */
  excludedRowCount: number;
};

const exactSku = (sku: string) => sku.trim();
const isExcluded = (sku: string) => EXCLUDED_SKUS.has(exactSku(sku));

function duplicateCounts(rows: { sku: string }[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const sku = exactSku(row.sku);
    if (sku) counts.set(sku, (counts.get(sku) ?? 0) + 1);
  }
  return counts;
}

/**
 * Build a deterministic, read-only comparison plan.
 *
 * Matching is case-sensitive after trimming surrounding whitespace. There is
 * no fallback to Model Code, product name, barcode, or SKU fragments.
 */
export function buildCatalogueSyncPlan(
  sheetRows: SheetCatalogueRow[],
  bizRows: BizSathiCatalogueRow[],
): CatalogueSyncPlan {
  // Excluded rows are removed before any duplicate checks or report creation.
  const master = sheetRows.filter(row => !isExcluded(row.sku));
  const biz = bizRows.filter(row => !isExcluded(row.sku));
  const masterCounts = duplicateCounts(master);
  const bizCounts = duplicateCounts(biz);
  const masterDuplicates = new Set([...masterCounts].filter(([, count]) => count > 1).map(([sku]) => sku));
  const bizDuplicates = new Set([...bizCounts].filter(([, count]) => count > 1).map(([sku]) => sku));
  const issues: CatalogueSyncPlan['issues'] = [];

  for (const row of master) if (!exactSku(row.sku)) issues.push({ source: 'Master', reason: 'blank_sku', rowCount: 1 });
  for (const row of biz) if (!exactSku(row.sku)) issues.push({ source: 'BizSathi', reason: 'blank_sku', rowCount: 1 });
  for (const [sku, count] of masterCounts) if (masterDuplicates.has(sku)) issues.push({ source: 'Master', reason: 'duplicate_sku', rowCount: count });
  for (const [sku, count] of bizCounts) if (bizDuplicates.has(sku)) issues.push({ source: 'BizSathi', reason: 'duplicate_sku', rowCount: count });

  const bizBySku = new Map<string, BizSathiCatalogueRow>();
  for (const row of biz) {
    const sku = exactSku(row.sku);
    if (sku && !bizDuplicates.has(sku)) bizBySku.set(sku, row);
  }
  const masterSkuSet = new Set(master.map(row => exactSku(row.sku)).filter(Boolean));
  const updates: CatalogueSyncPlan['updates'] = [];
  const inserts: SheetCatalogueRow[] = [];
  const openingBaseline: CatalogueSyncPlan['openingBaseline'] = [];

  for (const row of master) {
    const sku = exactSku(row.sku);
    if (!sku || masterDuplicates.has(sku) || bizDuplicates.has(sku)) continue;
    const existing = bizBySku.get(sku);
    if (existing) {
      updates.push({
        sku,
        variantId: existing.id,
        productId: existing.product_id,
        fields: {
          product_name: row.product_name,
          category: row.category,
          variant_name: row.variant_name,
          barcode: row.barcode ?? null,
          unit: row.unit,
          selling_price: row.selling_price,
          purchase_price: row.purchase_price,
          mrp: row.mrp,
          wholesale_price: row.wholesale_price,
          reorder_level: row.reorder_level,
          model_code: row.model_code?.trim() || null,
        },
      });
      openingBaseline.push({ sku, quantity: row.opening_stock, variantId: existing.id });
    } else {
      inserts.push(row);
      openingBaseline.push({ sku, quantity: row.opening_stock, variantId: null });
    }
  }

  const extraBizSathi = biz
    .filter(row => exactSku(row.sku) && !masterSkuSet.has(exactSku(row.sku)))
    .map(row => ({ sku: exactSku(row.sku), variantId: row.id, active: row.is_active }));

  return {
    updates,
    inserts,
    extraBizSathi,
    issues,
    openingBaseline,
    excludedRowCount: sheetRows.length - master.length + bizRows.length - biz.length,
  };
}
