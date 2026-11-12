import {z} from 'zod';
import Decimal from 'decimal.js';
import {snapshotSchema,buildReport,type ReportInput,type ReportRow} from './accounting';

export const businessSnapshotSchema=snapshotSchema.extend({timezone:z.string(),currency:z.string(),users:z.array(z.object({id:z.string(),name:z.string()})),variants:z.array(z.object({id:z.string(),business_id:z.string(),name:z.string(),sku:z.string(),unit:z.string(),reorder_level:z.string(),is_active:z.boolean()})),movements:z.array(z.object({id:z.string(),business_id:z.string(),branch_id:z.string(),variant_id:z.string(),quantity:z.string(),kind:z.string(),reference:z.string(),reason:z.string(),actor_id:z.string(),created_at:z.string(),movement_date:z.string(),source_id:z.string(),source_type:z.string()}))});
export type BusinessSnapshot=z.infer<typeof businessSnapshotSchema>;
export const reportViews=[['sales','Sales and profit'],['purchases','Purchases'],['valuation','Inventory valuation'],['stock','Stock movement'],['lowstock','Low stock'],['customer','Customer ledger'],['supplier','Supplier ledger'],['receivables','Receivables'],['payables','Payables'],['expenses','Expenses'],['cashbook','Cash and bank'],['trial','Trial balance'],['profit','Profit and loss'],['balance','Balance sheet'],['cashflow','Cash flow'],['vat','Tax summaries'],['ledger','General ledger'],['accounts','Posting accounts'],['statement','Party statement'],['outstanding','Outstanding balances']] as const;
export const unavailableReports:Partial<Record<ReportInput['view'],string>>={valuation:'Inventory valuation requires approved stock costing and legitimate opening and receipt costs.',balance:'A complete balance sheet requires established opening balances and classified asset, liability and equity accounts.'};
export function supportsUser(view:ReportInput['view']){return !['accounts','trial','lowstock','valuation','profit','balance','vat'].includes(view);}
export function reportContext(f:ReportInput,s:BusinessSnapshot){return{Report:reportViews.find(([id])=>id===f.view)?.[1]??f.view,From:f.from,Through:f.to,'Branch filter':f.branchId?s.branches.find(b=>b.id===f.branchId)?.name??f.branchId:'All authorized branches','User filter':supportsUser(f.view)&&f.userId?s.users.find(u=>u.id===f.userId)?.name??f.userId:'All users',Currency:s.currency,Timezone:s.timezone};}
export function paginateRows(rows:ReportRow[],page:number,all:boolean){const actual=Math.min(page,Math.max(1,Math.ceil(rows.length/50)));return{rows:all?rows:rows.slice((actual-1)*50,actual*50),total:rows.length,page:actual};}
export function reportColumns(rows:ReportRow[]){return [...new Set(rows.flatMap(r=>Object.keys(r)))];}
export function exportReportRows(rows:ReportRow[],context:Record<string,string>){const columns=reportColumns(rows);return rows.map(row=>({...context,...Object.fromEntries(columns.map(key=>[key,row[key]??'']))}));}
export type DocLines={id:string;kind:string;document_date:string;lines:unknown}[];
type L={variantId:string;quantity:number;price:number;discount:number};
const readL=(v:unknown):L[]=>Array.isArray(v)?v.flatMap(x=>x&&typeof x==='object'&&typeof (x as L).variantId==='string'?[{variantId:(x as L).variantId,quantity:Number((x as L).quantity)||0,price:Number((x as L).price)||0,discount:Number((x as L).discount)||0}]:[]):[];
/** Cost of goods uses each item's most recent confirmed purchase price on or before the sale date. */
export function costOfGoods(docs:DocLines){
 const buys=docs.filter(d=>d.kind==='purchase').flatMap(d=>readL(d.lines).filter(l=>l.quantity>0).map(l=>({v:l.variantId,date:d.document_date,cost:new Decimal(l.price).times(l.quantity).minus(l.discount).div(l.quantity)}))).sort((a,b)=>a.date.localeCompare(b.date));
 const last=(v:string,date:string)=>{let c:Decimal|null=null;for(const b of buys){if(b.v===v&&b.date<=date)c=b.cost;}return c;};
 const byDoc=new Map<string,{cost:Decimal;missing:number}>();
 for(const d of docs.filter(d=>d.kind==='sale'||d.kind==='sale_return')){let cost=new Decimal(0),missing=0;for(const l of readL(d.lines)){const c=last(l.variantId,d.document_date);if(c)cost=cost.plus(c.times(l.quantity));else missing++;}byDoc.set(d.id,{cost:d.kind==='sale_return'?cost.neg():cost,missing});}
 return byDoc;
}
export function buildBusinessReport(s:BusinessSnapshot,f:ReportInput,docLines:DocLines=[]){
 if(f.view==='profit'){
  const docs=s.documents.filter(d=>d.business_id===f.businessId&&(!f.branchId||d.branch_id===f.branchId)&&d.status==='confirmed'&&d.document_date>=f.from&&d.document_date<=f.to);
  const sum=(k:string)=>docs.filter(d=>d.kind===k).reduce((n,d)=>n.plus(d.subtotal),new Decimal(0));
  const cogsMap=costOfGoods(docLines);let cogs=new Decimal(0),missing=0;for(const d of docs){const c=cogsMap.get(d.id);if(c){cogs=cogs.plus(c.cost);missing+=c.missing;}}
  const sales=sum('sale'),returns=sum('sale_return'),net=sales.minus(returns),gross=net.minus(cogs);
  const j=s.journals.filter(x=>x.business_id===f.businessId&&(!f.branchId||x.branch_id===f.branchId)&&x.entry_date>=f.from&&x.entry_date<=f.to);
  const group=(prefix:string,sign:1|-1)=>{const m=new Map<string,Decimal>();for(const x of j.filter(x=>x.account_code.startsWith(prefix)))m.set(x.account_code,(m.get(x.account_code)??new Decimal(0)).plus(new Decimal(x.debit).minus(x.credit).times(sign)));return m;};
  const exp=group('expense_',1),inc=group('income_',-1);const label=(c:string)=>c.replace(/^(expense|income)_/,'').replaceAll('_',' ').replace(/^./,x=>x.toUpperCase());
  const totalExp=[...exp.values()].reduce((a,b)=>a.plus(b),new Decimal(0)),totalInc=[...inc.values()].reduce((a,b)=>a.plus(b),new Decimal(0));
  const r=(Section:string,Item:string,v:Decimal)=>({Section,Item,Amount:v.toFixed(2)});
  const rows:ReportRow[]=[r('Income','Sales',sales),r('Income','Sales return',returns.neg()),r('Income','Net sales',net),r('Cost','Cost of goods sold (last purchase price)',cogs.neg()),r('Gross','Gross profit',gross),...[...inc].map(([c,v])=>r('Other income',label(c),v)),...[...exp].map(([c,v])=>r('Expenses',label(c),v.neg())),r('Expenses','Total expenses',totalExp.neg()),r('Net','Net profit',gross.plus(totalInc).minus(totalExp))];
  return{rows,totals:{debit:'0.00',credit:'0.00',difference:'0.00'},evidence:[],hasRecords:true,notice:`Amounts exclude VAT. Cost uses each item's last purchase price on or before the sale date.${missing?` ${missing} sold item line(s) have no earlier purchase price and are counted at zero cost.`:''}`};
 }
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
 rows=rows.map(r=>{const sourceId=r['Source ID'];const journal=s.journals.find(j=>j.source_id===sourceId);const doc=s.documents.find(d=>d.id===sourceId);const actorId=doc?.actor_id??journal?.actor_id;const cg=f.view==='sales'&&sourceId?costOfGoods(docLines).get(sourceId):undefined;const extra=cg?{'Cost (last purchase)':cg.cost.toFixed(2),Profit:new Decimal(r['Net']??0).minus(cg.cost).toFixed(2)}:{};return sourceId?{...r,...extra,Branch:branch(doc?.branch_id??journal?.branch_id??''),'Posted by':actor(actorId),'User ID':actorId??''}:r;});
 let notice=userId?'User posting subset — not a complete business balance.':'Recorded postings only; opening balances not established and not externally reconciled.';
 if(['outstanding','receivables','payables'].includes(f.view))notice=`As at ${f.to}; user selects original invoice creator. All linked settlements included. Invoice age is not overdue age.`;
 if(f.view==='sales'||f.view==='purchases'){const total=rows.reduce((sum,r)=>sum.plus(r['Total']??0),new Decimal(0));notice=`${f.view==='sales'?'Sales':'Purchases'} net of returns: ${s.currency} ${total.toFixed(2)}. ${f.view==='sales'?`Profit (before VAT, using last purchase price): ${s.currency} ${rows.reduce((n,r)=>n.plus(r['Profit']??0),new Decimal(0)).toFixed(2)}.`:''}${userId?' Original document posting user selected.':''}`;}
 if(f.view==='cashflow')notice='Recorded cash/bank/wallet movement book only — not a classified cash-flow statement.';
 if(f.view==='vat')notice='Configured VAT postings only — not a statutory tax filing.';
 if(f.view==='customer'||f.view==='supplier'){const party=s.parties.find(p=>p.id===f.partyId);if(party?.kind!==(f.view==='customer'?'customer':'supplier'))rows=[];}
 return{...report,rows,notice};
}