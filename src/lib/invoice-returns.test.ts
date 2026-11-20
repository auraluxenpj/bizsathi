import {describe,it,expect} from 'vitest';
import {returnableLines,returnSettlement,returnLine,type ReturnDocument} from './invoice-returns';

const variant='10000000-0000-4000-8000-000000000001';
const source=(kind:'sale'|'purchase',lines:unknown):ReturnDocument=>({id:'source',source_id:null,kind,status:'confirmed',total:100,lines});
const doc=(id:string,kind:string,sourceId:string,status:string,lines:unknown):ReturnDocument=>({id,source_id:sourceId,kind,status,total:10,lines});
const line=(quantity:number)=>[{variantId:variant,quantity,price:10,discount:0,taxRate:0}];

describe('return quantity and settlement rules',()=>{
  it('subtracts only confirmed linked sale returns from the original sold quantity',()=>{
    const original=source('sale',line(10));
    const rows=returnableLines(original,[
      doc('return-1','sale_return','source','confirmed',line(3)),
      doc('return-draft','sale_return','source','draft',line(2)),
      doc('other-sale','sale_return','another-source','confirmed',line(4)),
    ]);
    expect(rows[0]?.returned).toBe(3);
    expect(rows[0]?.remaining).toBe(7);
    expect(rows[0]?.maximum).toBe(7);
  });

  it('caps purchase returns by received quantity, prior returns and current branch stock',()=>{
    const original=source('purchase',line(10));
    const rows=returnableLines(original,[
      doc('receipt','goods_receipt','source','confirmed',line(7)),
      doc('purchase-return','purchase_return','source','confirmed',line(2)),
    ],new Map([[variant,4]]));
    expect(rows[0]).toMatchObject({received:7,returned:2,remaining:8,maximum:4});
  });

  it('applies a return credit to the unpaid invoice balance before refunding the remainder',()=>{
    expect(returnSettlement(100,80,10,0,20)).toEqual({
      applied:10,refundable:10,newRefund:10,refundsPaid:0,outstanding:0,
    });
  });

  it('deducts refunds already paid on earlier returns from the next refund entitlement',()=>{
    expect(returnSettlement(100,80,10,5,20)).toEqual({
      applied:10,refundable:5,newRefund:10,refundsPaid:5,outstanding:0,
    });
  });

  it('does not refund a return credit while the original invoice still has unpaid balance',()=>{
    expect(returnSettlement(100,0,0,0,30)).toEqual({
      applied:30,refundable:0,newRefund:0,refundsPaid:0,outstanding:70,
    });
  });

  it('keeps the original unit price and tax rate and prorates line discount for a partial return',()=>{
    const original={variantId:variant,quantity:4,price:100,discount:12,taxRate:13};
    expect(returnLine(original,2)).toEqual({
      variantId:variant,quantity:2,price:100,discount:6,taxRate:13,
    });
  });
});
