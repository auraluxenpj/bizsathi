import { describe, it, expect } from 'vitest';
import { catalogueRow } from './inventory-schemas';
import { makeCatalogueCsv, parseCatalogueCsv, catalogueColumns } from './inventory-csv';
import { parseGoogleSheetValues } from './google-sheet-catalogue';
const biz = '10000000-0000-4000-8000-000000000001';
describe('Model code in catalogue sheets', () => {
  it('imports a Model Code column next to the SKU', () => {
    const [row] = parseCatalogueCsv('product_name,sku,Model Code,selling_price\nKurti,AL-K-M, M100 ,2500', biz);
    expect(row).toMatchObject({ sku: 'AL-K-M', model_code: 'M100' });
  });
  it('accepts the alias Model and leaves old sheets without the column blank', () => {
    expect(parseCatalogueCsv('product_name,sku,Model\nA,S1,X9', biz)[0]!.model_code).toBe('X9');
    expect(parseCatalogueCsv('product_name,sku\nA,S1', biz)[0]!.model_code).toBe('');
  });
  it('exports model_code right after sku and round-trips', () => {
    expect(catalogueColumns.indexOf('model_code')).toBe(catalogueColumns.indexOf('sku') + 1);
    const csv = makeCatalogueCsv([{ product_name: 'Kurti', variant_name: 'M', sku: 'AL-K-M', model_code: 'M100', barcode: '', unit: 'pcs', selling_price: 1, purchase_price: 1, reorder_level: 0 }], true);
    expect(csv.split('\n')[0]).toContain('sku,model_code,barcode');
    expect(parseCatalogueCsv(csv, biz)[0]).toMatchObject({ sku: 'AL-K-M', model_code: 'M100' });
  });
  it('Google Sheet values use the same column', () => {
    const rows = parseGoogleSheetValues([['product_name', 'sku', 'model_code'], ['A', 'S1', 'M7']], biz);
    expect(rows[0]!.model_code).toBe('M7');
  });
  it('rejects a model code over 64 characters', () => {
    expect(catalogueRow.safeParse({ product_name: 'A', sku: 'S', model_code: 'x'.repeat(65) }).success).toBe(false);
  });
});
