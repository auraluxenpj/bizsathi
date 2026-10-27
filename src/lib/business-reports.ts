import {z} from 'zod';
import Decimal from 'decimal.js';
import {snapshotSchema,buildReport,type ReportInput,type ReportRow} from './accounting';

export const businessSnapshotSchema=snapshotSchema.extend({timezone:z.string(),currency:z.string(),users:z.array(z.object({id:z.string(),name:z.string()})),variants:z.array(z.object({id:z.string(),business_id:z.string(),name:z.string(),sku:z.string(),unit:z.string(),reorder_level:z.string(),is_active:z.boolean()})),movements:z.array(z.object({id:z.string(),business_id:z.string(),branch_id:z.string(),variant_id:z.string(),quantity:z.string(),kind:z.string(),reference:z.string(),reason:z.string(),actor_id:z.string(),created_at:z.string(),movement_date:z.string(),source_id:z.string(),source_type:z.string()}))});
export type BusinessSnapshot=z.infer<typeof businessSnapshotSchema>;
export const reportViews=[['sales','Sales and profit'],['purchases','Purchases'],['valuation','Inventory valuation'],['stock','Stock movement'],['lowstock','Low stock'],['customer','Customer ledger'],['supplier','Supplier ledger'],['receivables','Receivables'],['payables','Payables'],['expenses','Expenses'],['cashbook','Cash and bank'],['trial','Trial balance'],['profit','Profit and loss'],['balance','Balance sheet'],['cashflow','Cash flow'],['vat','Tax summaries'],['ledger','General ledger'],['accounts','Posting accounts'],['statement','Party statement'],['outstanding','Outstanding balances']] as const;
export const unavailableReports:Partial<Record<ReportInput['view'],string>>={valuation:'Inventory valuation requires approved stock costing and legitimate opening and receipt costs.',profit:'Profit and loss requires inventory costing, COGS and complete expense/account classification.',balance:'A complete balance sheet requires established opening balances and classified asset, liability and equity accounts.'};
export function supportsUser(view:ReportInput['view']){return !['accounts','trial','lowstock','valuation','profit','balance','vat'].includes(view);}
export function reportContext(f:ReportInput,s:BusinessSnapshot){return{Report:reportViews.find(([id])=>id===f.view)?.[1]??f.view,From:f.from,Through:f.to,Branch:f.branchId?s.branches.find(b=>b.id===f.branchId)?.name??f.branchId:'All authorized branches','Posted by':supportsUser(f.view)&&f.userId?s.users.find(u=>u.id===f.userId)?.name??f.userId:'All users',Currency:s.currency,Timezone:s.timezone};}
export function paginateRows(rows:ReportRow[],page:number,all:boolean){const actual=Math.min(page,Math.max(1,Math.ceil(rows.length/50)));return{rows:all?rows:rows.slice((actual-1)*50,actual*50),total:rows.length,page:actual};}
export function buildBusinessReport(s:BusinessSnapshot,f:ReportInput){
 const userId=supportsUser(f.view)?f.userId:undefined;
 const scoped=(r:{business_id:string;branch_id:string})=>r.business_id===f.businessId&&(!f.branchId||r.branch_id===f.branchId);
 const actor=(id:string|undefined)=>s.users.find(u=>u.id===id)?.name??id??'Unattributed';
 const branch=(id:string)=>s.branches.find(b=>b.id===id)?.name??id;
 if(unavailableReports[f.view])return{rows:[] as ReportRow[],totals:{debit:'0.00',credit:'0.00',difference:'0.00'},evidence:[],hasRecords:false,notice:unavailableReports[f.view]};
 if(f.view==='stock'||f.view==='lowstock'){
 const movements=s.movements.filter(m=>scoped(m)&&m.movement_date<=f.to);let rows:ReportRow[]=[];
 if(f.view==='stock')rows=movements.filter(m=>m.movement_date>=f.from&&(!userId||m.actor_id===userId)).map(m=>({Date:m.movement_date,'Posted at':m.created_at,Branch:branch(m.branch_id),Product:s.variants.find(v=>v.id===m.variant_id)?.name??m.variant_id,SKU:s.variants.find(v=>v.id===m.variant_id)?.sku??'',Quantity:new Decimal(m.quantity).toFixed(3),Kind:m.kind,Reference:m.reference,Reason:m.reason,'Posted by':actor(m.actor_id),'User ID':m.actor_id,'Movement ID':m.id,'Source type':m.source_type,'Source ID':m.source_id}));
 else {const balances=new Map<string,Decimal>();for(const m of movements){const key=`${m.branch_id}:${m.variant_id}`;balances.set(key,(balances.get(key)??new Decimal(0)).plus(m.quantity));}rows=s.branches.filter(b=>!f.branchId||b.id===f.branchId).flatMap(b=>s.variants.filter(v=>v.business_id===f.businessId&&v.is_active).flatMap(v=>{const quantity=balances.get(`${b.id}:${v.id}`)??new Decimal(0);if(quantity.gt(v.reorder_level))return[];return[{'As at':f.to,Branch:b.name,Product:v.name,SKU:v.sku,Unit:v.unit,'On hand':quantity.toFixed(3),Threshold:new Decimal(v.reorder_level).toFixed(3)}];}));}
 return{rows,totals:{debit:'0.00',credit:'0.00',difference:'0.00'},evidence:[],hasRecords:rows.length>0,notice:f.view==='lowstock'?`Whole-branch quantities as at ${f.to}; all posting users included.`:`Stock dates use ${s.timezone}.`};
 }
 const ledgerView=['ledger','statement','customer','supplier','cashbook','cashflow','expenses'].includes(f.view);
 const filtered={...s,journals:s.journals.filter(j=>!ledgerView||!userId||j.actor_id===userId)};
 const mapped:ReportInput={...f,view:f.view==='customer'||f.view==='supplier'?'statement':f.view==='receivables'||f.view==='payables'?'outstanding':f.view==='cashflow'?'cashbook':f.view,account:f.view==='customer'?'receivable':f.view==='supplier'?'payable':f.account};
 const report=buildReport(filtered,mapped);
 let rows=report.rows;
 if(['sales','purchases'].includes(f.view))rows=rows.filter(r=>!userId||s.documents.find(d=>d.id===r['Source ID'])?.actor_id===userId);
 if(['outstanding','receivables','payables'].includes(f.view))rows=rows.filter(r=>(!userId||s.documents.find(d=>d.id===r['Source ID'])?.actor_id===userId)&&(f.view!=='receivables'||r['Kind']==='sale')&&(f.view!=='payables'||r['Kind']==='purchase'));
 rows=rows.map(r=>{const sourceId=r['Source ID'];const journal=s.journals.find(j=>j.source_id===sourceId);const doc=s.documents.find(d=>d.id===sourceId);const actorId=doc?.actor_id??journal?.actor_id;return sourceId?{...r,Branch:branch(doc?.branch_id??journal?.branch_id??''),'Posted by':actor(actorId),'User ID':actorId??''}:r;});
 let notice=userId?'User posting subset — not a complete business balance.':'Recorded postings only; opening balances not established and not externally reconciled.';
 if(['outstanding','receivables','payables'].includes(f.view))notice=`As at ${f.to}; user selects original invoice creator. All linked settlements included. Invoice age is not overdue age.`;
 if(f.view==='sales')notice='Sales and returns only. Profit unavailable until reliable costing and COGS exist.';
 if(f.view==='cashflow')notice='Recorded cash/bank/wallet movement book only — not a classified cash-flow statement.';
 if(f.view==='vat')notice='Configured VAT postings only — not a statutory tax filing.';
 if(f.view==='customer'||f.view==='supplier'){const party=s.parties.find(p=>p.id===f.partyId);if(party?.kind!==(f.view==='customer'?'customer':'supplier'))rows=[];}
 return{...report,rows,notice};
}