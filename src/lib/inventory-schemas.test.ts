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