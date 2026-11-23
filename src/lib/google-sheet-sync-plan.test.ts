import { describe, expect, it } from 'vitest';
import { buildCatalogueSyncPlan, type BizSathiCatalogueRow, type SheetCatalogueRow } from './google-sheet-sync-plan';

const sheet = (sku: string, model_code = 'MODEL-A', opening_stock = 5): SheetCatalogueRow => ({
  sku, product_name: 'Kurti', category: 'Kurti', variant_name: 'M', model_code,
  barcode: '', unit: 'pcs', selling_price: 1500, purchase_price: 900, mrp: 1800,
  wholesale_price: 1300, reorder_level: 2, opening_stock,
});
const biz = (sku: string, id = 'variant-1', model_code: string | null = 'OTHER-MODEL'): BizSathiCatalogueRow => ({
  id, product_id: 'product-1', sku, product_name: 'Old name', category: 'Old',
  variant_name: 'Standard', model_code, barcode: null, unit: 'pcs',
  selling_price: 1000, purchase_price: 500, mrp: 0, wholesale_price: 0,
  reorder_level: 0, is_active: true,
});

describe('Auraluxe Google Sheets sync planning', () => {
  it('matches only exact SKU and does not use Model Code as identity', () => {
    const plan = buildCatalogueSyncPlan([sheet('SKU-1', 'MODEL-X')], [biz('SKU-1', 'v1', 'MODEL-Y')]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]?.variantId).toBe('v1');
    expect(plan.inserts).toHaveLength(0);
  });

  it('treats case differences as distinct SKUs', () => {
    const plan = buildCatalogueSyncPlan([sheet('sku-1')], [biz('SKU-1')]);
    expect(plan.inserts.map(row => row.sku)).toEqual(['sku-1']);
    expect(plan.updates).toHaveLength(0);
  });

  it('never includes SKU in a field patch', () => {
    const plan = buildCatalogueSyncPlan([sheet('SKU-1')], [biz('SKU-1')]);
    expect(plan.updates[0]?.fields).not.toHaveProperty('sku');
  });

  it('blocks duplicate SKUs rather than guessing which row is correct', () => {
    const plan = buildCatalogueSyncPlan([sheet('SKU-1'), sheet('SKU-1')], [biz('SKU-1')]);
    expect(plan.updates).toHaveLength(0);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.issues).toContainEqual({ source: 'Master', reason: 'duplicate_sku', rowCount: 2 });
  });

  it('preserves BizSathi-only SKUs and reports them without deactivation', () => {
    const plan = buildCatalogueSyncPlan([sheet('SKU-1')], [biz('SKU-1'), biz('EXTRA-1', 'v-extra')]);
    expect(plan.extraBizSathi).toEqual([{ sku: 'EXTRA-1', variantId: 'v-extra', active: true }]);
  });

  it('keeps opening baseline separate from product field updates', () => {
    const plan = buildCatalogueSyncPlan([sheet('SKU-1', 'MODEL-A', 12)], [biz('SKU-1')]);
    expect(plan.openingBaseline).toEqual([{ sku: 'SKU-1', quantity: 12, variantId: 'variant-1' }]);
    expect(plan.updates[0]?.fields).not.toHaveProperty('opening_stock');
  });

  it('omits explicitly excluded SKUs from every output collection', () => {
    const excluded = ['AL-PARTYWEAR-736', 'AL-PARTYWEAR-737', 'al001'];
    const plan = buildCatalogueSyncPlan(
      [...excluded.map(sku => sheet(sku)), sheet('SKU-1')],
      [...excluded.map((sku, i) => biz(sku, `protected-${i}`)), biz('SKU-1')],
    );
    const serialized = JSON.stringify(plan);
    for (const sku of excluded) expect(serialized).not.toContain(sku);
    expect(plan.excludedRowCount).toBe(6);
  });
});
