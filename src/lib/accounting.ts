import Decimal from 'decimal.js';
import {z} from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(`${v}T00:00:00Z`);return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;},'Use a valid date.');
export const reportInput=z.object({businessId:z.string().uuid(),branchId:z.string().uuid().optional(),from:date,to:date,view:z.enum(['accounts','ledger','trial','sales','purchases','statement','outstanding','cashbook','vat','expenses']),account:z.string().default('all'),partyId:z.string().uuid().optional(),page:z.number().int().min(1).default(1),export:z.boolean().default(false)}).refine(v=>v.from<=v.to,'Start date must precede end date.');
export type ReportInput=z.infer<typeof reportInput>;
const scoped={id:z.string(),business_id:z.string(),branch_id:z.string()};
export const snapshotSchema=z.object({
 journals:z.array(z.object({...scoped,entry_date:z.string(),created_at:z.string(),account_code:z.string(),source_id:z.string(),source_type:z.string(),debit:z.string(),credit:z.string(),actor_id:z.string().optional()})),
 documents:z.array(z.object({...scoped,kind:z.string(),status:z.string(),document_date:z.string(),reference:z.string(),party_id:z.string().nullable(),source_id:z.string().nullable(),subtotal:z.string(),tax:z.string(),total:z.string()})),
 payments:z.array(z.object({...scoped,document_id:z.string(),payment_date:z.string(),reference:z.string(),amount:z.string(),direction:z.string(),method:z.string()})),
 vouchers:z.array(z.object({...scoped,kind:z.string(),voucher_date:z.string(),reference:z.string(),reason:z.string(),reverses_id:z.string().nullable(),actor_id:z.string()})).default([]),
 counters:z.array(z.object({id:z.string(),reference:z.string()})),parties:z.array(z.object({id:z.string(),name:z.string(),kind:z.string()})),branches:z.array(z.object({id:z.string(),name:z.string()})),periods:z.array(z.object({id:z.string(),name:z.string(),start_date:z.string(),end_date:z.string()}))
});
export type Snapshot=z.infer<typeof snapshotSchema>;
export const accounts=[['cash','Cash'],['bank','Bank'],['wallet','Digital wallet'],['receivable','Accounts receivable'],['payable','Accounts payable'],['sales','Sales'],['purchases','Periodic purchases'],['vat_output','VAT output'],['vat_input','VAT input'],['counter_clearing','Counter clearing'],['expense_rent','Rent expense'],['expense_utilities','Utilities expense'],['expense_operating','Operating expense']] as const;
export type ReportRow=Record<string,string>;
const money=(v:Decimal.Value)=>new Decimal(v).toFixed(2);
export function buildReport(s:Snapshot,f:ReportInput){
 const scope=(r:{business_id:string;branch_id:string})=>r.business_id===f.businessId&&(!f.branchId||r.branch_id===f.branchId);
 const docs=s.documents.filter(d=>scope(d)&&d.status==='confirmed'&&d.document_date<=f.to);
 const pays=s.payments.filter(p=>scope(p)&&p.payment_date<=f.to);
 const journals=s.journals.filter(j=>scope(j)&&j.entry_date<=f.to).sort((a,b)=>a.entry_date.localeCompare(b.entry_date)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 const documentMap=new Map(docs.map(d=>[d.id,d]));const paymentMap=new Map(pays.map(p=>[p.id,p]));
 const party=(id:string|null)=>s.parties.find(p=>p.id===id)?.name??'Walk-in / unassigned';
 const source=(j:Snapshot['journals'][number])=>{const p=j.source_type==='payment'?paymentMap.get(j.source_id):undefined;const v=j.source_type==='voucher'?s.vouchers.find(v=>v.id===j.source_id&&scope(v)):undefined;const d=j.source_type==='voucher'?undefined:documentMap.get(p?.document_id??j.source_id);return {reference:v?.reference??p?.reference??d?.reference??s.counters.find(c=>c.id===j.source_id)?.reference??j.source_id,document:d,payment:p,voucher:v};};
 const totals=accounts.map(([code,name])=>{const a=journals.filter(j=>j.account_code===code);let opening=new Decimal(0),debit=new Decimal(0),credit=new Decimal(0);for(const j of a){if(j.entry_date<f.from)opening=opening.plus(j.debit).minus(j.credit);else{debit=debit.plus(j.debit);credit=credit.plus(j.credit);}}const closing=opening.plus(debit).minus(credit);return {Account:name,Code:code,'Opening signed':money(opening),Debit:money(debit),Credit:money(credit),'Closing debit':money(Decimal.max(closing,0)),'Closing credit':money(Decimal.max(closing.negated(),0))};});
 let rows:ReportRow[]=[];
 if(f.view==='accounts'||f.view==='trial')rows=totals;
 if(f.view==='ledger'||f.view==='cashbook'||f.view==='statement'){
  const selected=journals.filter(j=>{if(f.view==='cashbook'&&!['cash','bank','wallet'].includes(j.account_code))return false;if(f.view==='statement'){if(!['receivable','payable'].includes(j.account_code))return false;const d=source(j).document;if(!d?.party_id||!f.partyId||d.party_id!==f.partyId)return false;}return f.account==='all'||j.account_code===f.account;});
  const balances=new Map<string,Decimal>();
  for(const j of selected){const key=j.account_code;const b=(balances.get(key)??new Decimal(0)).plus(j.debit).minus(j.credit);balances.set(key,b);if(j.entry_date<f.from)continue;const link=source(j);rows.push({Date:j.entry_date,Account:key,Reference:link.reference,Party:party(link.document?.party_id??null),Debit:money(j.debit),Credit:money(j.credit),'Running signed':money(b),'Source type':j.source_type,'Source ID':j.source_id,'Document ID':link.document?.id??''});}
  rows.unshift(...[...new Set(selected.map(j=>j.account_code))].map(code=>({Date:f.from,Account:code,Reference:'Opening recorded postings',Party:f.partyId?party(f.partyId):'',Debit:'',Credit:'','Running signed':money(selected.filter(j=>j.account_code===code&&j.entry_date<f.from).reduce((a,j)=>a.plus(j.debit).minus(j.credit),new Decimal(0))),'Source type':'opening','Source ID':'','Document ID':''})));
 }
 if(f.view==='sales'||f.view==='purchases')rows=docs.filter(d=>d.document_date>=f.from&&(f.view==='sales'?['sale','sale_return']:['purchase','purchase_return']).includes(d.kind)).map(d=>{const sign=d.kind.endsWith('_return')?-1:1;return {Date:d.document_date,Reference:d.reference,Kind:d.kind,Party:party(d.party_id),Net:money(new Decimal(d.subtotal).times(sign)),Tax:money(new Decimal(d.tax).times(sign)),Total:money(new Decimal(d.total).times(sign)),'Source type':'document','Source ID':d.id,'Document ID':d.id};});
 if(f.view==='outstanding')rows=docs.filter(d=>['sale','purchase'].includes(d.kind)&&(!f.partyId||d.party_id===f.partyId)).flatMap(d=>{const paid=pays.filter(p=>p.document_id===d.id).reduce((a,p)=>a.plus(p.amount),new Decimal(0));const returns=docs.filter(r=>r.source_id===d.id&&(r.kind==='sale_return'||r.kind==='purchase_return'));const returned=returns.reduce((a,r)=>a.plus(r.total),new Decimal(0));const refund=pays.filter(p=>returns.some(r=>r.id===p.document_id)).reduce((a,p)=>a.plus(p.amount),new Decimal(0));const remaining=new Decimal(d.total).minus(paid).minus(returned).plus(refund);if(remaining.eq(0))return [];return [{Date:d.document_date,Reference:d.reference,Party:party(d.party_id),Kind:d.kind,Total:money(d.total),Payments:money(paid),'Linked returns':money(returned),Refunds:money(refund),'Outstanding / credit':money(remaining),'Invoice age (days)':String(Math.floor((Date.parse(f.to)-Date.parse(d.document_date))/86400000)),'Source type':'document','Source ID':d.id,'Document ID':d.id}];});
 if(f.view==='vat')rows=totals.filter(t=>t.Code==='vat_output'||t.Code==='vat_input');
 if(f.view==='expenses')rows=journals.filter(j=>j.entry_date>=f.from&&j.account_code.startsWith('expense_')).map(j=>({Date:j.entry_date,Reference:source(j).reference,Account:j.account_code,Debit:money(j.debit),Credit:money(j.credit),Net:money(new Decimal(j.debit).minus(j.credit)),Reason:source(j).voucher?.reason??'',Actor:j.actor_id??source(j).voucher?.actor_id??'','Reverses voucher':source(j).voucher?.reverses_id??'','Source type':j.source_type,'Source ID':j.source_id,'Document ID':''}));
 const totalDebit=totals.reduce((a,r)=>a.plus(r.Debit),new Decimal(0)),totalCredit=totals.reduce((a,r)=>a.plus(r.Credit),new Decimal(0));
 const evidence=journals.filter(j=>j.entry_date>=f.from).map(j=>({...j,reference:source(j).reference,party:party(source(j).document?.party_id??null)}));
 return {rows,totals:{debit:money(totalDebit),credit:money(totalCredit),difference:money(totalDebit.minus(totalCredit))},evidence,hasRecords:journals.length>0||docs.length>0};
}