import {describe,it,expect} from 'vitest';
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
 it('maps Standard apparel to S through 2XL',()=>expect(catalogueSizesForVariant('Standard','Kurti')).toEqual(['S','M','L','XL','2XL']));
 it('maps Plus Size apparel to 3XL through 8XL',()=>expect(catalogueSizesForVariant('Plus Size','Kurti Set')).toEqual(['3XL','4XL','5XL','6XL','7XL','8XL']));
 it.each(['Saree','Purse','Accessories','Unstitched','Bags','Juttis'])('does not show clothing sizes for Standard %s',category=>expect(catalogueSizesForVariant('Standard',category)).toEqual([]));
 it('does not infer sizes for unknown variant labels',()=>expect(catalogueSizesForVariant('Free Size','Kurti')).toEqual([]));
});
