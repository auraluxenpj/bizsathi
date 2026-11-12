import { describe,it,expect } from 'vitest';
import { stockInput, stockBalances, catalogueRow } from './inventory-schemas';
import { makeCsv, parseCatalogueCsv } from './inventory-csv';
const a='10000000-0000-4000-8000-000000000001', b='10000000-0000-4000-8000-000000000002';
const stock={businessId:a,id:a,variantId:a,branchId:a,kind:'receive',quantity:1,reference:'GRN-1',reason:'Received delivery'};
describe('Inventory integrity',()=>{
 it('requires traceable reasons and references',()=>{expect(stockInput.safeParse({...stock,reference:''}).success).toBe(false);expect(stockInput.safeParse({...stock,reason:''}).success).toBe(false);});
 it('rejects zero and negative receiving quantities',()=>{expect(stockInput.safeParse({...stock,quantity:0}).success).toBe(false);expect(stockInput.safeParse({...stock,quantity:-1}).success).toBe(false);});
 it('allows negative correction but requires distinct transfer branches',()=>{expect(stockInput.safeParse({...stock,kind:'adjustment',quantity:-1}).success).toBe(true);expect(stockInput.safeParse({...stock,kind:'transfer',destinationBranchId:a}).success).toBe(false);expect(stockInput.safeParse({...stock,kind:'transfer',destinationBranchId:b}).success).toBe(true);});
 it('sums branch ledger quantities without floating point drift',()=>expect(stockBalances([{variant_id:a,branch_id:a,quantity:0.1},{variant_id:a,branch_id:a,quantity:0.2},{variant_id:a,branch_id:b,quantity:9}]).get(`${a}:${a}`)).toBe(0.3));
 it('rejects negative prices and overprecision quantities',()=>{expect(catalogueRow.safeParse({product_name:'Item',sku:'I',selling_price:-1}).success).toBe(false);expect(stockInput.safeParse({...stock,quantity:1.0001}).success).toBe(false);});
 it('imports quoted CSV and protects exported formula cells',()=>{expect(parseCatalogueCsv('product_name,sku\n"Shirt, red",S1',a)[0]?.product_name).toBe('Shirt, red');expect(makeCsv([{name:'=1+1'}])).toContain("'=1+1");});
});
import { describe as d2, it as i2, expect as e2 } from 'vitest';
import { catalogueInput as ci } from './inventory-schemas';
describe('Master sheet catalogue CSV compatibility', () => {
 it('parses the original format with all catalogue values', () => {
  expect(parseCatalogueCsv('product_name,category,variant_name,sku,barcode,unit,selling_price,reorder_level\nShirt,Clothing,Large,S1,123,pcs,1250.50,2.5', a)).toEqual([
   {product_name:'Shirt',category:'Clothing',variant_name:'Large',sku:'S1',barcode:'123',unit:'pcs',selling_price:1250.5,reorder_level:2.5},
  ]);
 });
 it('parses master sheet headers and formatted currency and quantities', () => {
  expect(parseCatalogueCsv('Item Name,Category,Variant / Size,Generated SKU,Barcode,Primary Unit,Selling Price,Reorder Level\nShirt,Clothing,Large,S1,123,pcs,"NPR 1,250.50","1,000"', a)).toEqual([
   {product_name:'Shirt',category:'Clothing',variant_name:'Large',sku:'S1',barcode:'123',unit:'pcs',selling_price:1250.5,reorder_level:1000},
  ]);
 });
 const aliasSets = [
  ['product_name', 'Item Name', 'item_name', 'Product Name', 'Product', 'Name'],
  ['variant_name', 'Variant / Size', 'Variant', 'Size'],
  ['sku', 'Generated SKU', 'SKU', 'Item Code', 'Code'],
  ['unit', 'Primary Unit', 'Unit'],
  ['selling_price', 'Selling Price', 'Sales Price', 'Price', 'Rate'],
  ['reorder_level', 'Reorder Level', 'Low Stock', 'Low Stock Threshold'],
 ];
 it.each(Array.from({length:6}, (_, i) => i))('accepts trimmed mixed-case aliases (set %s)', i => {
  const headers = aliasSets.map(aliases => ` ${aliases[i % aliases.length]?.toUpperCase()} `).join(',');
  expect(parseCatalogueCsv(`${headers}\nShirt,Large,S1,box,Rs. 250/-,3.125`, a)[0]).toMatchObject({product_name:'Shirt',variant_name:'Large',sku:'S1',unit:'box',selling_price:250,reorder_level:3.125});
 });
 it.each(['Item Name,Generated SKU\nShirt,S1', 'Item Name,Generated SKU,Variant / Size,Primary Unit,Reorder Level\nShirt,S1,  ,  ,  '])('defaults omitted or blank fields', csv => {
  expect(parseCatalogueCsv(csv, a)[0]).toMatchObject({variant_name:'Standard',unit:'pcs',selling_price:0,reorder_level:0});
 });
 it.each(['-1', 'NPR -100', '12abc', 'NPR nope', '1.234', '10%'])('rejects invalid prices: %s', price => {
  expect(() => parseCatalogueCsv(`Item Name,Generated SKU,Selling Price\nShirt,S1,${price}`, a)).toThrow();
 });
 it('preserves quoted names and currency symbols', () => {
  expect(parseCatalogueCsv('Item Name,Generated SKU,Price\n"Shirt, red",S1,"₨ 1,200.50"', a)[0]).toMatchObject({product_name:'Shirt, red',selling_price:1200.5});
 });
 it('still requires product and SKU headers and nonempty values', () => {
  expect(() => parseCatalogueCsv('Item Name,Price\nShirt,10', a)).toThrow();
  expect(() => parseCatalogueCsv('Item Name,Generated SKU\nShirt,', a)).toThrow();
 });
 it('round-trips exported catalogue CSV through the importer', () => {
  const rows = parseCatalogueCsv('Item Name,Generated SKU,Selling Price\nShirt,S1,250', a);
  expect(parseCatalogueCsv(makeCsv(rows), a)).toEqual(rows);
 });
});
d2('catalogue import limit', () => {
  const row = (n: number) => ({ product_name: `P${n}`, sku: `S${n}` });
  const biz = '00000000-0000-4000-8000-000000000001';
  i2('accepts 5000 rows', () => { e2(ci.safeParse({ businessId: biz, rows: Array.from({ length: 5000 }, (_, n) => row(n)) }).success).toBe(true); });
  i2('rejects 5001 rows', () => { e2(ci.safeParse({ businessId: biz, rows: Array.from({ length: 5001 }, (_, n) => row(n)) }).success).toBe(false); });
});

import { parseCatalogueCsv as parseKarobar } from './inventory-csv';
describe('Karobar item sheet', () => {
 const csv = 'Item Name,Category,Sales Price,Purchase Price,Item Code,Opening Stock,Primary Unit,MRP Price,Wholesale Price,Low Stock,HS Code,Description\nAL-ALA01-M,Kurti set 3 Piece,"1,999","1,347",ALA01-M,1,PIECES,"2,020","1,616",0,,ANUSHREE01\nAL-ALA01-XL,Kurti set 3 Piece,"1,999","1,347",ALA01-XL,3,PIECES,"2,020","1,616",0,,ANUSHREE01';
 it('groups sizes under the Description and reads opening stock', () => {
  const rows = parseKarobar(csv, '00000000-0000-4000-8000-000000000000');
  expect(rows.map(r => [r.product_name, r.variant_name, r.opening_stock])).toEqual([['ANUSHREE01','M',1],['ANUSHREE01','XL',3]]);
  expect(rows[0]!.selling_price).toBe(1999);
 });
});
