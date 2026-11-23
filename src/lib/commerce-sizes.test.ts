import {describe,it,expect} from 'vitest';
import {parseCatalogueCsv} from './inventory-csv';
import {commerceLine,catalogueSizesForVariant} from './commerce-schemas';
import {returnableLines,returnLine,sourceLines} from './invoice-returns';
const variant='10000000-0000-4000-8000-000000000001';
describe('SKU size allocations',()=>{
 it('requires size quantities to equal the SKU line quantity',()=>{
  const base={variantId:variant,quantity:3,price:100,discount:0,taxRate:0};
  expect(commerceLine.safeParse({...base,sizeBreakdown:[{size:'S',quantity:1},{size:'M',quantity:2}]}).success).toBe(true);
  expect(commerceLine.safeParse({...base,sizeBreakdown:[{size:'S',quantity:1},{size:'M',quantity:1}]}).success).toBe(false);
  expect(commerceLine.safeParse({...base,sizeBreakdown:[{size:'M',quantity:1},{size:'m',quantity:2}]}).success).toBe(false);
 });
 it('preserves original size quantities and subtracts prior size-specific returns',()=>{
  const source={id:'sale-1',source_id:null,kind:'sale',status:'confirmed',total:300,lines:[{variantId:variant,sku:'K-001',name:'Kurti',quantity:3,price:100,discount:0,taxRate:0,sizeBreakdown:[{size:'S',quantity:1},{size:'M',quantity:2}]}]};
  const prior={id:'return-1',source_id:'sale-1',kind:'sale_return',status:'confirmed',total:100,lines:[{variantId:variant,sku:'K-001',name:'Kurti',quantity:1,price:100,discount:0,taxRate:0,sizeBreakdown:[{size:'M',quantity:1}]}]};
  const [item]=returnableLines(source,[source,prior]);
  expect(item?.sizeBreakdown).toEqual([{size:'S',quantity:1},{size:'M',quantity:1}]);
  expect(item?.maximum).toBe(2);
  expect(returnLine(item!,item!.maximum).sizeBreakdown).toEqual([{size:'S',quantity:1},{size:'M',quantity:1}]);
  expect(sourceLines(source.lines)[0]?.sizeBreakdown).toEqual([{size:'S',quantity:1},{size:'M',quantity:2}]);
 });
});

describe('Auraluxe POS size groups',()=>{
 it('maps Standard apparel to S through 2XL when the sheet has no explicit sizes',()=>expect(catalogueSizesForVariant('Standard','Kurti')).toEqual(['S','M','L','XL','2XL']));
 it('uses imported catalogue sizes as the POS source of truth',()=>expect(catalogueSizesForVariant('M','Kurti',['XS','S','M','L','XL','2XL'])).toEqual(['XS','S','M','L','XL','2XL']));
 it('honours explicit sheet sizes even for a normally non-sized category',()=>expect(catalogueSizesForVariant('Standard','Bags',['Small','Medium'])).toEqual(['Small','Medium']));
 it('maps Plus Size apparel to 3XL through 8XL',()=>expect(catalogueSizesForVariant('Plus Size','Kurti Set')).toEqual(['3XL','4XL','5XL','6XL','7XL','8XL']));
 it('does not show clothing sizes for Plus Size non-apparel categories',()=>expect(catalogueSizesForVariant('Plus Size','Sarees')).toEqual([]));
 it('persists the Plus Size options when importing a fit_category column',()=>{const [row]=parseCatalogueCsv('product_name,category,fit_category,sku\nKurti Set,Kurti Set,Plus Size,K-001','10000000-0000-4000-8000-000000000001');expect(row?.variant_name).toBe('Plus Size');expect(row?.sizes).toBe('3XL, 4XL, 5XL, 6XL, 7XL, 8XL');});
 it('keeps legacy size-suffixed SKU rows outside the fit-size selector when no size column exists',()=>{const [row]=parseCatalogueCsv('product_name,description,category,sku\nKurti Set,Anarkali Set,Kurti Set,K-002-M','10000000-0000-4000-8000-000000000001');expect(row?.variant_name).toBe('M');expect(row?.sizes).toBe('');});
 it('converts explicit per-SKU size variants into shared product POS sizes',()=>{const rows=parseCatalogueCsv('product_name,category,variant_name,sku,Size\nAnushree,Kurti,M,AL-001-M,M\nAnushree,Kurti,L,AL-001-L,L\nAnushree,Kurti,XL,AL-001-XL,XL\nAnushree,Kurti,2XL,AL-001-2XL,2XL','10000000-0000-4000-8000-000000000001');expect(rows.map(row=>row.variant_name)).toEqual(['Standard','Standard','Standard','Standard']);expect(rows.map(row=>row.sizes)).toEqual(['M, L, XL, 2XL','M, L, XL, 2XL','M, L, XL, 2XL','M, L, XL, 2XL']);});
 it.each(['Saree','Purse','Accessories','Unstitched','Bags','Juttis'])('does not show clothing sizes for Standard %s',category=>expect(catalogueSizesForVariant('Standard',category)).toEqual([]));
 it('does not infer sizes for unknown variant labels',()=>expect(catalogueSizesForVariant('Free Size','Kurti')).toEqual([]));
});
