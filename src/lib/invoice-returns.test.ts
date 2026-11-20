import {describe,it,expect} from 'vitest';
import {returnSettlement,returnLine,returnableLines,type ReturnDocument} from './invoice-returns';

const source:ReturnDocument={id:'10000000-0000-4000-8000-000000000001',source_id:null,kind:'sale',status:'confirmed',total:100,lines:[{variantId:'20000000-0000-4000-8000-000000000002',quantity:3,price:30,discount:0,taxRate:0}]};
const variant='20000000-0000-4000-8000-000000000002';

describe('POS return settlement',()=>{
 it('applies a return against unpaid invoice balance before issuing a refund',()=>{
  expect(returnSettlement(100,60,0,0,20)).toEqual({applied:20,refundable:0,newRefund:0,refundsPaid:0,outstanding:20});
 });
 it('refunds only the paid amount remaining after earlier returns and refunds',()=>{
  expect(returnSettlement(100,100,20,20,30)).toEqual({applied:0,refundable:30,newRefund:30,refundsPaid:20,outstanding:0});
 });
 it('does not create a refund when the invoice is unpaid',()=>{
  expect(returnSettlement(100,0,0,0,20)).toEqual({applied:20,refundable:0,newRefund:0,refundsPaid:0,outstanding:80});
 });
 it('prorates original line discount for partial returns with half-up rounding',()=>{
  const line=returnLine({variantId:variant,quantity:3,price:10,discount:1,taxRate:13},1);
  expect(line).toEqual({variantId:variant,quantity:1,price:10,discount:0.33,taxRate:13});
 });
 it('limits purchase returns to received quantity and available branch stock',()=>{
  const purchase:ReturnDocument={...source,id:'30000000-0000-4000-8000-000000000003',kind:'purchase',lines:[{variantId:variant,quantity:3,price:30,discount:0,taxRate:0}]};
  const receipt:ReturnDocument={id:'40000000-0000-4000-8000-000000000004',source_id:purchase.id,kind:'goods_receipt',status:'confirmed',total:60,lines:[{variantId:variant,quantity:2,price:30,discount:0,taxRate:0}]};
  const returned=returnableLines(purchase,[receipt],new Map([[variant,1]]));
  expect(returned[0]?.received).toBe(2);
  expect(returned[0]?.maximum).toBe(1);
 });
 it('does not count unconfirmed return documents against returnable quantity',()=>{
  const pending:ReturnDocument={id:'50000000-0000-4000-8000-000000000005',source_id:source.id,kind:'sale_return',status:'draft',total:30,lines:[{variantId:variant,quantity:1,price:30,discount:0,taxRate:0}]};
  expect(returnableLines(source,[pending])[0]?.maximum).toBe(3);
 });
});
