import {z} from 'zod';
import Decimal from 'decimal.js';
export const voucherAccounts=[['bank','Bank'],['wallet','Digital wallet'],['cash','Cash (safe)'],['expense_rent','Rent expense'],['expense_utilities','Utilities expense'],['expense_operating','Operating expense'],['expense_salaries','Salaries'],['expense_transport','Transport'],['expense_marketing','Marketing'],['expense_supplies','Supplies'],['expense_repairs','Repairs & maintenance'],['expense_professional','Professional fees']] as const;
export const voucherAccountIds=['bank','wallet','cash','expense_rent','expense_utilities','expense_operating','expense_salaries','expense_transport','expense_marketing','expense_supplies','expense_repairs','expense_professional'] as const;
const amount=z.string().regex(/^\d{1,16}(\.\d{1,2})?$/).refine(v=>new Decimal(v).lt('10000000000000000'),'Amount too large.');
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(`${v}T00:00:00Z`);return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;},'Valid date required.');
const fields={id:z.string().uuid(),businessId:z.string().uuid(),branchId:z.string().uuid(),periodId:z.string().uuid(),date,reference:z.string().trim().min(1).max(200),reason:z.string().trim().min(1).max(2000)};
export const voucherLine=z.object({account:z.enum(voucherAccountIds),debit:amount,credit:amount}).strict().refine(l=>(new Decimal(l.debit).gt(0)&&new Decimal(l.credit).eq(0))||(new Decimal(l.credit).gt(0)&&new Decimal(l.debit).eq(0)),'Each line needs one positive debit or credit.');
export const voucherInput=z.discriminatedUnion('kind',[
 z.object({...fields,kind:z.literal('reversal'),reversesId:z.string().uuid()}).strict(),
 z.object({...fields,kind:z.enum(['journal','expense']),lines:z.array(voucherLine).min(2).max(50)}).strict()
]).superRefine((v,ctx)=>{if(v.kind==='reversal')return;const debit=v.lines.reduce((s,l)=>s.plus(l.debit),new Decimal(0)),credit=v.lines.reduce((s,l)=>s.plus(l.credit),new Decimal(0));if(!debit.gt(0)||!debit.eq(credit))ctx.addIssue({code:'custom',message:'Debits and credits must balance.'});if(v.kind==='expense'&&v.lines.some(l=>!((l.account.startsWith('expense_')&&new Decimal(l.debit).gt(0))||(['bank','wallet','cash'].includes(l.account)&&new Decimal(l.credit).gt(0)))))ctx.addIssue({code:'custom',message:'Expenses debit an expense account and credit bank, wallet or cash.'});});
export type VoucherRequest=z.infer<typeof voucherInput>;
export function voucherPendingKey(userId:string,businessId:string){return `bizsathi-voucher-request:${userId}:${businessId}`;}