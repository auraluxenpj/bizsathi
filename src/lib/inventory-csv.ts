import Papa from 'papaparse';
import { catalogueInput, type CatalogueRow } from './inventory-schemas';
export const catalogueColumns = ['product_name','category','variant_name','sku','barcode','unit','selling_price','reorder_level'];
export function parseCatalogueCsv(text:string, businessId:string): CatalogueRow[] {
 const parsed = Papa.parse<Record<string,string>>(text, {header:true,skipEmptyLines:'greedy',transformHeader:h=>h.trim()});
 if(parsed.errors.length) throw new Error(`CSV row ${ (parsed.errors[0].row ?? 0)+2 }: ${parsed.errors[0].message}`);
 if(!parsed.meta.fields?.includes('product_name') || !parsed.meta.fields.includes('sku')) throw new Error('CSV requires product_name and sku columns.');
 return catalogueInput.parse({businessId,rows:parsed.data.map(r=>({...r,variant_name:r.variant_name || 'Standard',unit:r.unit || 'pcs'}))}).rows;
}
export function makeCsv(rows: Record<string, unknown>[], fields?:string[]) { return Papa.unparse(fields ? {fields,data:rows.map(r=>fields.map(f=>r[f] ?? ''))} : rows, {escapeFormulae:true}); }