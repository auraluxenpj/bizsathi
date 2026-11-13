import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { catalogueColumns, makeCatalogueCsv, parseCatalogueCsv } from './inventory-csv';

const biz = '10000000-0000-4000-8000-000000000001';

describe('MRP and wholesale price in catalogue sheets', () => {
  it('exports both prices right after selling_price', () => {
    const at = catalogueColumns.indexOf('selling_price');
    expect(catalogueColumns.slice(at, at + 3)).toEqual(['selling_price', 'mrp', 'wholesale_price']);
  });
  it('round-trips an exported sheet', () => {
    const csv = makeCatalogueCsv([{ product_name: 'Kurti', variant_name: 'M', sku: 'K-M', unit: 'pcs', qty: 1, selling_price: 1999, mrp: 2499, wholesale_price: 1750, purchase_price: 1347.5, reorder_level: 1 }], true);
    expect(parseCatalogueCsv(csv, biz)[0]).toMatchObject({ sku: 'K-M', selling_price: 1999, mrp: 2499, wholesale_price: 1750 });
  });
  it('keeps both prices when the purchase price is hidden', () => {
    const head = makeCatalogueCsv([{ product_name: 'A', sku: 'S', mrp: 10, wholesale_price: 8, purchase_price: 5 }], false).split('\r\n')[0] ?? '';
    expect(head).toContain('mrp');
    expect(head).toContain('wholesale_price');
    expect(head).not.toContain('purchase_price');
  });
  it.each([['MRP', 'mrp'], ['Maximum Retail Price', 'mrp'], ['Wholesale Price', 'wholesale_price'], ['Wholesale Rate', 'wholesale_price']])('imports formatted values from %s', (header, field) => {
    expect(parseCatalogueCsv(`product_name,sku,${header}\nA,S1,"NPR 1,250"`, biz)[0]).toMatchObject({ [field as string]: 1250 });
  });
  it('treats missing columns as zero so older sheets still import', () => {
    expect(parseCatalogueCsv('product_name,sku,selling_price\nA,S1,100', biz)[0]).toMatchObject({ mrp: 0, wholesale_price: 0 });
  });
  it('rejects a malformed price instead of importing part of it', () => {
    expect(() => parseCatalogueCsv('product_name,sku,mrp\nA,S1,12abc', biz)).toThrow();
    expect(() => parseCatalogueCsv('product_name,sku,wholesale_price\nA,S1,-5', biz)).toThrow();
  });
  it('the downloadable template carries both columns', () => {
    const t = readFileSync('public/downloads/product-import-template.csv', 'utf8');
    expect(parseCatalogueCsv(t, biz)[0]).toMatchObject({ mrp: 2499, wholesale_price: 1750 });
  });
});
