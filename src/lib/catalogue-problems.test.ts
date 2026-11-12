import { describe, it, expect } from 'vitest';
import { catalogueProblems, makeSkusUnique } from './inventory-csv';
const row = (product_name: string, variant_name: string, sku: string, barcode = '') => ({ product_name, variant_name, sku, barcode });
// The shape of the sheet that failed to import: every size of a product shares one SKU.
const sheet = ['M', 'L', 'XL', '2XL', '3XL'].map((v) => row('ANUSHREE01', v, 'AL-KURTI-001')).concat(['M', 'L'].map((v) => row('ANUSHREE03', v, 'AL-KURTI-003')));
describe('Catalogue import problems', () => {
  it('flags a SKU repeated across sizes, with its row count', () => {
    const p = catalogueProblems(sheet, new Set());
    expect(p.any).toBe(true); expect(p.duplicateSkus).toEqual([{ sku: 'AL-KURTI-001', count: 5 }, { sku: 'AL-KURTI-003', count: 2 }]);
  });
  it('flags SKUs that already exist in the business', () => {
    const p = catalogueProblems([row('A', 'M', 'AL-1'), row('B', 'M', 'AL-2')], new Set(['AL-2']));
    expect(p.existingSkus).toEqual(['AL-2']); expect(p.any).toBe(true);
  });
  it('flags repeated barcodes but ignores blank ones', () => {
    const p = catalogueProblems([row('A', 'M', 'S1', '123'), row('A', 'L', 'S2', '123'), row('B', 'M', 'S3'), row('B', 'L', 'S4')], new Set());
    expect(p.duplicateBarcodes).toEqual(['123']);
  });
  it('reports no problems for a clean sheet', () => expect(catalogueProblems([row('A', 'M', 'S1'), row('A', 'L', 'S2')], new Set()).any).toBe(false));
});
describe('Making repeated SKUs unique', () => {
  it('adds the size to every row of a repeated SKU', () => {
    const { rows, changed } = makeSkusUnique(sheet);
    expect(changed).toBe(7);
    expect(rows.slice(0, 5).map((r) => r.sku)).toEqual(['AL-KURTI-001-M', 'AL-KURTI-001-L', 'AL-KURTI-001-XL', 'AL-KURTI-001-2XL', 'AL-KURTI-001-3XL']);
    expect(catalogueProblems(rows, new Set()).any).toBe(false);
  });
  it('leaves rows with a unique SKU untouched', () => {
    const rows = [row('A', 'M', 'S1'), row('A', 'L', 'S1'), row('B', 'M', 'S9')];
    const r = makeSkusUnique(rows).rows;
    expect(r.map((x) => x.sku)).toEqual(['S1-M', 'S1-L', 'S9']);
  });
  it('cannot fix rows that repeat the same size, so they stay flagged', () => {
    const r = makeSkusUnique([row('A', 'M', 'S1'), row('A', 'M', 'S1')]).rows;
    expect(catalogueProblems(r, new Set()).duplicateSkus).toEqual([{ sku: 'S1-M', count: 2 }]);
  });
  it('does not change rows when a size name is blank', () => {
    const r = makeSkusUnique([row('A', '', 'S1'), row('A', ' ', 'S1')]).rows;
    expect(r.map((x) => x.sku)).toEqual(['S1', 'S1']);
  });
});
