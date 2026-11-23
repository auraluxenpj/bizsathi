import Decimal from 'decimal.js';
import { lineTotals, type CommerceRequest } from './commerce-schemas';
export type ReturnLine = CommerceRequest['lines'][number] & {name?:string;sku?:string};
export type ReturnDocument = {id:string;source_id:string|null;kind:string;status:string;total:number|string;lines:unknown};
export function sourceLines(value: unknown): ReturnLine[] {
  if(!Array.isArray(value))return [];
  return value.flatMap(v=>{
    if(!v||typeof v!=='object'||typeof v.variantId!=='string')return [];
    return [{variantId:v.variantId,name:String(v.name??''),sku:String(v.sku??''),quantity:Number(v.quantity),price:Number(v.price),discount:Number(v.discount??0),taxRate:Number(v.taxRate??0),...(Array.isArray(v.sizeBreakdown)?{sizeBreakdown:v.sizeBreakdown.flatMap(a=>{if(!a||typeof a!=='object'||typeof (a as {size?:unknown}).size!=='string')return[];const size=(a as {size:string}).size;const quantity=Number((a as {quantity?:unknown}).quantity);return quantity>0?[{size,quantity}]:[];})}:{})}];
  });
}
/** Quantities still available to receive against a confirmed supplier invoice. */
export function receivableLines(source:ReturnDocument, documents:ReturnDocument[]) {
  const receipts=documents.filter(d=>d.source_id===source.id&&d.kind==='goods_receipt'&&d.status==='confirmed');
  return sourceLines(source.lines).map(line=>{
    const received=receipts.flatMap(d=>sourceLines(d.lines)).filter(row=>row.variantId===line.variantId)
      .reduce((sum,row)=>sum.plus(row.quantity),new Decimal(0));
    const remaining=Decimal.max(0,new Decimal(line.quantity).minus(received));
    return {...line,received:received.toNumber(),remaining:remaining.toNumber(),maximum:remaining.toNumber()};
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
    const sizeBreakdown=l.sizeBreakdown?.map(a=>{
      const used=linked.filter(d=>d.kind===kind).flatMap(d=>sourceLines(d.lines)).filter(r=>r.variantId===l.variantId).flatMap(r=>r.sizeBreakdown??[]).filter(r=>r.size.toLowerCase()===a.size.toLowerCase()).reduce((n,r)=>n.plus(r.quantity),new Decimal(0));
      return {size:a.size,quantity:Decimal.max(0,new Decimal(a.quantity).minus(used)).toNumber()};
    }).filter(a=>a.quantity>0);
    const sizedMaximum=sizeBreakdown?sizeBreakdown.reduce((n,a)=>n.plus(a.quantity),new Decimal(0)):null;
    const maximum=source.kind==='purchase'&&!sizeBreakdown?Decimal.min(remaining,available,stock?.get(l.variantId)??available):sizedMaximum??remaining;
    return {...l,...(sizeBreakdown?{sizeBreakdown}:{}),returned:returned.toNumber(),received:received.toNumber(),remaining:remaining.toNumber(),maximum:maximum.toNumber()};
  });
}
export function returnLine(original:ReturnLine, quantity:number):CommerceRequest['lines'][number] {
  return {variantId:original.variantId,quantity,price:original.price,taxRate:original.taxRate,
    discount:new Decimal(original.discount).mul(quantity).div(original.quantity).toDecimalPlaces(2,Decimal.ROUND_HALF_UP).toNumber(),...(original.sizeBreakdown?{sizeBreakdown:original.sizeBreakdown}: {})};
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