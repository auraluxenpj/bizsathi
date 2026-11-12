import Decimal from 'decimal.js';
import { lineTotals, type CommerceRequest } from './commerce-schemas';
export type ReturnLine = CommerceRequest['lines'][number] & {name?:string;sku?:string};
export type ReturnDocument = {id:string;source_id:string|null;kind:string;status:string;total:number|string;lines:unknown};
export function sourceLines(value: unknown): ReturnLine[] {
  if(!Array.isArray(value))return [];
  return value.flatMap(v=>{
    if(!v||typeof v!=='object'||typeof v.variantId!=='string')return [];
    return [{variantId:v.variantId,name:String(v.name??''),sku:String(v.sku??''),quantity:Number(v.quantity),price:Number(v.price),discount:Number(v.discount??0),taxRate:Number(v.taxRate??0)}];
  });
}
export function returnableLines(source:ReturnDocument, documents:ReturnDocument[], stock?:Map<string,number>) {
  const kind=source.kind==='sale'?'sale_return':'purchase_return';
  const linked=documents.filter(d=>d.source_id===source.id&&d.status==='confirmed');
  return sourceLines(source.lines).map(l=>{
    const quantityOf=(k:string)=>linked.filter(d=>d.kind===k).flatMap(d=>sourceLines(d.lines)).filter(r=>r.variantId===l.variantId).reduce((sum,r)=>sum.plus(r.quantity),new Decimal(0));
    const returned=quantityOf(kind);
    const received=source.kind==='purchase'?Decimal.min(l.quantity,quantityOf('goods_receipt')):new Decimal(l.quantity);
    const remaining=Decimal.max(0,new Decimal(l.quantity).minus(returned));
    const available=Decimal.max(0,received.minus(returned));
    const maximum=source.kind==='purchase'?Decimal.min(remaining,available,stock?.get(l.variantId)??available):remaining;
    return {...l,returned:returned.toNumber(),received:received.toNumber(),remaining:remaining.toNumber(),maximum:maximum.toNumber()};
  });
}
export function returnLine(original:ReturnLine, quantity:number):CommerceRequest['lines'][number] {
  return {variantId:original.variantId,quantity,price:original.price,taxRate:original.taxRate,
    discount:new Decimal(original.discount).mul(quantity).div(original.quantity).toDecimalPlaces(2,Decimal.ROUND_HALF_UP).toNumber()};
}
export function returnSettlement(originalTotal:number, originalPaid:number, returnedTotal:number, refundsPaid:number, newCredit=0) {
  const total=new Decimal(originalTotal),paid=new Decimal(originalPaid),returned=new Decimal(returnedTotal),credit=new Decimal(newCredit);
  const unpaid=Decimal.max(0,total.minus(paid).minus(returned));
  const applied=Decimal.min(unpaid,credit);
  const entitlement=Decimal.max(0,paid.minus(total.minus(returned).minus(credit)));
  return {applied:applied.toNumber(),refundable:Decimal.max(0,entitlement.minus(refundsPaid)).toNumber(),
    newRefund:Decimal.max(0,credit.minus(applied)).toNumber(),refundsPaid,
    outstanding:Decimal.max(0,total.minus(returned).minus(credit).minus(paid)).toNumber()};
}
export function returnCredit(lines:ReturnLine[]) {
  return lines.reduce((sum,l)=>sum.plus(lineTotals(l).total),new Decimal(0)).toNumber();
}