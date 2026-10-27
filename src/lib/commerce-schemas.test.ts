import {describe,it,expect} from 'vitest';
import {cartTotal,lineTotals,commerceLine,paymentPart} from './commerce-schemas';
const line={variantId:'10000000-0000-4000-8000-000000000001',quantity:1,price:100,discount:10,taxRate:13};
describe('Commerce amounts',()=>{
 it('rounds each line half up then computes tax on discounted base',()=>expect(lineTotals(line)).toEqual({base:90,tax:11.7,total:101.7}));
 it('sums precise decimal totals rather than floating point totals',()=>expect(cartTotal([{...line,price:0.1,discount:0,taxRate:0},{...line,price:0.2,discount:0,taxRate:0}])).toBe(0.3));
 it('rejects a discount larger than the rounded line price',()=>expect(commerceLine.safeParse({...line,discount:101}).success).toBe(false));
 it('rejects negative price and quantity',()=>{expect(commerceLine.safeParse({...line,price:-1}).success).toBe(false);expect(commerceLine.safeParse({...line,quantity:-1}).success).toBe(false);});
 it('rejects fractional cents and quantity precision beyond three decimals',()=>{expect(commerceLine.safeParse({...line,price:1.001}).success).toBe(false);expect(commerceLine.safeParse({...line,quantity:1.0001}).success).toBe(false);});
 it('requires a positive payment and reference',()=>expect(paymentPart.safeParse({id:line.variantId,method:'cash',amount:0,reference:''}).success).toBe(false));
});