import {formatNPR} from './format';
export type PoDoc={id:string;kind:string;status:string;source_id:string|null;reference:string;document_date:string;total:number|string;party_id:string|null;lines:unknown};
export type PoStatus='draft'|'pending'|'billed_draft'|'partially_billed'|'billed';
/** Derives order progress from linked purchase bills; orders never move stock or post accounts. */
export function orderStatus(order:PoDoc,docs:PoDoc[]):PoStatus{
 if(order.status==='draft')return 'draft';
 const bills=docs.filter(d=>d.kind==='purchase'&&d.source_id===order.id);
 const confirmed=bills.filter(b=>b.status==='confirmed');
 if(confirmed.length){
  const ordered=new Map<string,number>();
  const invoiced=new Map<string,number>();
  const lines=(value:unknown):{variantId:string;quantity:number}[]=>Array.isArray(value)?value.flatMap(item=>{
   if(!item||typeof item!=='object')return [];
   const row=item as Record<string,unknown>;
   const variantId=typeof row.variantId==='string'?row.variantId:'';
   const quantity=Number(row.quantity);
   return variantId&&Number.isFinite(quantity)&&quantity>0?[{variantId,quantity}]:[];
  }):[];
  for(const line of lines(order.lines))ordered.set(line.variantId,(ordered.get(line.variantId)??0)+line.quantity);
  for(const bill of confirmed)for(const line of lines(bill.lines))invoiced.set(line.variantId,(invoiced.get(line.variantId)??0)+line.quantity);
  const remaining=[...ordered].some(([id,quantity])=>quantity-(invoiced.get(id)??0)>0.000001);
  return remaining?'partially_billed':'billed';
 }
 return bills.length?'billed_draft':'pending';
}
export function daysOpen(order:PoDoc,today:string){return Math.max(0,Math.round((Date.parse(today)-Date.parse(order.document_date))/86400000));}
export const statusLabel:Record<PoStatus,string>={draft:'Draft',pending:'Sent · awaiting goods',billed_draft:'Bill in progress',partially_billed:'Partially billed',billed:'Fully billed'};
export function orderMessage(business:string,supplier:string,order:PoDoc,lines:{name:string;sku:string;quantity:number}[]){
 return [`${business} — Purchase order ${order.reference}`,`Supplier: ${supplier}`,`Date: ${order.document_date}`,lines.map(l=>`• ${l.name}${l.sku?` (${l.sku})`:''} × ${l.quantity}`).join('\\n'),`Order value: ${formatNPR(order.total)}`,'Please confirm availability and delivery date.'].join('\\n\\n');
}
