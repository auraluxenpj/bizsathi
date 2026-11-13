import Papa from 'papaparse';
import { generateBarcodeFromSkuIfNeeded } from './barcode';
import { catalogueInput, type CatalogueRow } from './inventory-schemas';

export const catalogueColumns = ['product_name','category','variant_name','sku','model_code','barcode','unit','qty','selling_price','mrp','wholesale_price','purchase_price','reorder_level'];
const headerAliases: Record<string, string[]> = {
 product_name: ['product_name', 'Item Name', 'item_name', 'Product Name', 'Product', 'Name'],
 category: ['category'],
 variant_name: ['variant_name', 'Variant / Size', 'Variant', 'Size'],
 sku: ['sku', 'Generated SKU', 'Item Code', 'Code'],
 model_code: ['model_code', 'Model Code', 'Model', 'Model No', 'Model Number'],
 barcode: ['barcode'],
 unit: ['unit', 'Primary Unit'],
 selling_price: ['selling_price', 'Selling Price', 'Sales Price', 'Price', 'Rate'],
 mrp: ['mrp', 'MRP', 'M.R.P', 'Maximum Retail Price'],
 wholesale_price: ['wholesale_price', 'Wholesale Price', 'Wholesale Rate'],
 purchase_price: ['purchase_price', 'Purchase Price', 'Cost Price'],
 // qty is the exported name; on import it is the quantity to open as stock for new items (same as the older opening_stock column).
 opening_stock: ['opening_stock', 'Opening Stock', 'Opening Qty', 'qty', 'Qty', 'Quantity', 'Stock', 'Current Stock'],
 description: ['description', 'Description'],
 reorder_level: ['reorder_level', 'Reorder Level', 'Low Stock', 'Low Stock Threshold'],
};
const canonicalHeaders = new Map(Object.entries(headerAliases).flatMap(([column, aliases]) => aliases.map(alias => [alias.toLowerCase(), column] as const)));
function normalizeHeader(header: string) {
 const trimmed = header.trim();
 return canonicalHeaders.get(trimmed.toLowerCase()) ?? trimmed;
}
function csvNumber(value: string | undefined): number {
 const trimmed = value?.trim() ?? '';
 if (!trimmed) return 0;
 const cleaned = trimmed.replace(/^[\p{L}\p{Sc}]+\.?\s*/u, '').replace(/[,&\s]/g, '').replace(/\/-$/, '');
 // Reject malformed values rather than silently importing a partial number.
 return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned) ? Number(cleaned) : NaN;
}
export function parseCatalogueCsv(text:string, businessId:string): CatalogueRow[] {
 const parsed = Papa.parse<Record<string,string>>(text, {header:true,skipEmptyLines:'greedy',transformHeader:normalizeHeader});
 const firstError=parsed.errors[0];
 if(firstError) throw new Error(`CSV row ${ (firstError.row ?? 0)+2 }: ${firstError.message}`);
 if(!parsed.meta.fields?.includes('product_name') || !parsed.meta.fields.includes('sku')) throw new Error('CSV requires product_name and sku columns.');
 return catalogueInput.parse({businessId,rows:parsed.data.map(r => ({
   ...r,
   // Karobar sheets list one row per size; group them by Description and use the SKU suffix as the size.
   ...(()=>{const group=r['description']?.trim(); const sku=r['sku']?.trim() ?? ''; const explicit=r['variant_name']?.trim();
     if(!group || explicit) return {variant_name: explicit || 'Standard'};
     const cut=sku.lastIndexOf('-'); return {product_name: group, variant_name: cut>0 && cut<sku.length-1 ? sku.slice(cut+1) : 'Standard'};})(),
   sku: r['sku']?.trim() || '',
   model_code: r['model_code']?.trim() || '',
   barcode: generateBarcodeFromSkuIfNeeded(r['sku'] ?? '', r['barcode']?.trim() || ''),
   unit: r['unit']?.trim() || 'pcs',
   selling_price: csvNumber(r['selling_price']),
   mrp: csvNumber(r['mrp']),
   wholesale_price: csvNumber(r['wholesale_price']),
   reorder_level: csvNumber(r['reorder_level']),
   opening_stock: csvNumber(r['opening_stock']),
   purchase_price: csvNumber(r['purchase_price'])
 }))}).rows;
}
export function makeCsv(rows: Record<string, unknown>[], fields?:string[]) { return Papa.unparse(rows, {escapeFormulae:true,columns:fields}); }
export function makeCatalogueCsv(rows: Record<string, unknown>[], canViewPurchasePrice: boolean) {
 return makeCsv(rows, catalogueColumns.filter(column => canViewPurchasePrice || column !== 'purchase_price'));
}
