import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeCatalogueCsv, parseCatalogueCsv, catalogueColumns } from './inventory-csv';
import { variantStockTotals } from './inventory-schemas';
const biz = '10000000-0000-4000-8000-000000000001';
describe('Qty in catalogue sheets', () => {
  it('exports qty right after unit', () => {
    expect(catalogueColumns.indexOf('qty')).toBe(catalogueColumns.indexOf('unit') + 1);
    const csv = makeCatalogueCsv([{ product_name: 'Kurti', variant_name: 'M', sku: 'K-M', unit: 'pcs', qty: 7.5, selling_price: 100, purchase_price: 50, reorder_level: 1 }], true);
    const [head, row] = csv.split('\r\n');
    expect(head).toContain('unit,qty,selling_price'); expect(row).toContain('pcs,7.5,100');
  });
  it('keeps qty when the purchase price is hidden', () => {
    const csv = makeCatalogueCsv([{ product_name: 'A', sku: 'S', qty: 3, purchase_price: 9 }], false);
    expect(csv.split('\r\n')[0]).toContain('qty'); expect(csv.split('\r\n')[0]).not.toContain('purchase_price');
  });
  it('imports a qty column as the quantity to open as stock', () => {
    expect(parseCatalogueCsv('product_name,sku,qty,selling_price\nA,S1,12,100', biz)[0]).toMatchObject({ sku: 'S1', opening_stock: 12 });
  });
  it('accepts Qty, Quantity, Stock and the older opening_stock names', () => {
    for (const h of ['Qty', 'Quantity', 'Stock', 'Current Stock', 'opening_stock', 'Opening Qty']) {
      expect(parseCatalogueCsv(`product_name,sku,${h}\nA,S1,4`, biz)[0]!.opening_stock).toBe(4);
    }
  });
  it('treats a blank or missing qty as zero and tolerates formatted numbers', () => {
    expect(parseCatalogueCsv('product_name,sku,qty\nA,S1,', biz)[0]!.opening_stock).toBe(0);
    expect(parseCatalogueCsv('product_name,sku\nA,S1', biz)[0]!.opening_stock).toBe(0);
    expect(parseCatalogueCsv('product_name,sku,qty\nA,S1,"1,250"', biz)[0]!.opening_stock).toBe(1250);
  });
  it('rejects a malformed qty instead of importing part of it', () => {
    expect(() => parseCatalogueCsv('product_name,sku,qty\nA,S1,12abc', biz)).toThrow();
  });
  it('round-trips an exported sheet', () => {
    const csv = makeCatalogueCsv([{ product_name: 'Kurti', category: '', variant_name: 'M', sku: 'K-M', model_code: 'M1', barcode: '', unit: 'pcs', qty: 6, selling_price: 100, purchase_price: 50, reorder_level: 1 }], true);
    expect(parseCatalogueCsv(csv, biz)[0]).toMatchObject({ sku: 'K-M', model_code: 'M1', opening_stock: 6 });
  });
  it('the downloadable template uses the qty column', () => {
    const t = readFileSync('public/downloads/product-import-template.csv', 'utf8');
    expect(t.split('\n')[0]).toContain('qty'); expect(t).not.toContain('opening_stock');
  });
});
describe('Stock totals for export', () => {
  it('adds quantities across branches per variant without float drift', () => {
    const m = [{ variant_id: 'a', quantity: 0.1 }, { variant_id: 'a', quantity: 0.2 }, { variant_id: 'a', quantity: -0.05 }, { variant_id: 'b', quantity: 10 }];
    const t = variantStockTotals(m);
    expect(t.get('a')).toBe(0.25); expect(t.get('b')).toBe(10); expect(t.get('c')).toBeUndefined();
  });
});
