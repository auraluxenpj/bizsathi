import {formatNPR} from './format';
export type PoDoc={id:string;kind:string;status:string;source_id:string|null;reference:string;document_date:string;total:number|string;party_id:string|null;lines:unknown};
export type PoStatus='draft'|'pending'|'billed_draft'|'billed';
/** Derives order progress from linked purchase bills; orders never move stock or post accounts. */
export function orderStatus(order:PoDoc,docs:PoDoc[]):PoStatus{
 if(order.status==='draft')return 'draft';
 const bills=docs.filter(d=>d.kind==='purchase'&&d.source_id===order.id);
 if(bills.some(b=>b.status==='confirmed'))return 'billed';
 return bills.length?'billed_draft':'pending';
}
export function daysOpen(order:PoDoc,today:string){return Math.max(0,Math.round((Date.parse(today)-Date.parse(order.document_date))/86400000));}
export const statusLabel:Record<PoStatus,string>={draft:'Draft',pending:'Sent · awaiting goods',billed_draft:'Bill in progress',billed:'Billed'};
export function orderMessage(business:string,supplier:string,order:PoDoc,lines:{name:string;sku:string;quantity:number}[]){
 return [`${business} — Purchase order ${order.reference}`,`Supplier: ${supplier}`,`Date: ${order.document_date}`,lines.map(l=>`• ${l.name}${l.sku?` (${l.sku})`:''} × ${l.quantity}`).join('\n'),`Order value: ${formatNPR(order.total)}`,'Please confirm availability and delivery date.'].join('\n\n');
}
