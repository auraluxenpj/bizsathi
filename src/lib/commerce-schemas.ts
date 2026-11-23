import { z } from 'zod';
import Decimal from 'decimal.js';
import {normalizeMobile} from './loyalty';
const id=z.string().uuid();

const STANDARD_CLOTHING_SIZES = ['S','M','L','XL','2XL'] as const;
const PLUS_CLOTHING_SIZES = ['3XL','4XL','5XL','6XL','7XL','8XL'] as const;
const NON_SIZED_CATEGORIES = ['saree','saris','purse','bag','bags','accessory','accessories','jewellery','jewelry','juttis','jutti','unstitched'];
/** Only apparel categories use clothing-size allocations; accessories retain one-size SKU handling. */
export function isClothingSizeCategory(category:string|null|undefined):boolean{
 const normalized=(category??'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
 return !NON_SIZED_CATEGORIES.some(item=>normalized===item||normalized.includes(item));
}
/** Resolve POS size choices from the SKU's fit/size classification and product category. */
export function catalogueSizesForVariant(variantName:string, category:string|null|undefined):string[]{
 if(!isClothingSizeCategory(category))return [];
 const variant=variantName.trim().toLowerCase();
 if(variant==='plus size')return [...PLUS_CLOTHING_SIZES];
 if(variant==='standard')return [...STANDARD_CLOTHING_SIZES];
 return [];
}

const money=z.coerce.number().finite().min(0).max(999999999).refine(n=>new Decimal(n).decimalPlaces()<=2,'Use at most two decimal places.');
const sizeAllocation=z.object({size:z.string().trim().min(1).max(40),quantity:z.coerce.number().finite().positive().max(999999).refine(n=>new Decimal(n).decimalPlaces()<=3,'Use at most three decimal places.')});
export const commerceLine=z.object({variantId:id,quantity:z.coerce.number().finite().positive().max(999999).refine(n=>new Decimal(n).decimalPlaces()<=3,'Use at most three decimal places.'),price:money,discount:money.default(0),loyaltyDiscount:money.optional(),taxRate:money.refine(n=>n<=100,'Tax cannot exceed 100%.').default(0),sizeBreakdown:z.array(sizeAllocation).min(1).max(100).optional()}).refine(l=>new Decimal(l.quantity).mul(l.price).toDecimalPlaces(2).gte(l.discount),'Discount exceeds line value.').refine(l=>l.loyaltyDiscount===undefined||new Decimal(l.loyaltyDiscount).lte(l.discount),'Loyalty discount exceeds the line discount.').refine(l=>!l.sizeBreakdown||new Decimal(l.sizeBreakdown.reduce((n,a)=>n+a.quantity,0)).eq(l.quantity),'Size quantities must add up to the SKU line quantity.').refine(l=>!l.sizeBreakdown||new Set(l.sizeBreakdown.map(a=>a.size.toLowerCase())).size===l.sizeBreakdown.length,'A size can appear only once per SKU line.');
export const paymentPart=z.object({id,method:z.enum(['cash','bank','wallet']),amount:money.refine(n=>n>0,'Amount must be positive.'),sessionId:id.nullable().default(null),reference:z.string().trim().min(1).max(200)});
export const storedDocumentInput=z.object({businessId:id,id,branchId:id,periodId:id,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),kind:z.enum(['sale','purchase','sale_return','purchase_return','purchase_order','goods_receipt']),status:z.enum(['draft','confirmed']),sourceId:id.nullable().default(null),partyId:id.nullable().default(null),mobile:z.string().max(40).optional(),customerName:z.string().trim().max(120).optional(),redeemPoints:z.number().int().min(0).max(100_000_000).optional(),quotationId:id.optional(),customerSnapshot:z.object({name:z.string(),phone:z.string(),address:z.string(),pan:z.string()}).optional(),reference:z.string().trim().min(1).max(200),lines:z.array(commerceLine).min(1).max(100),payments:z.array(paymentPart).max(10).default([])});
export const documentInput=storedDocumentInput.superRefine((d,ctx)=>{if(d.kind==='sale'&&d.status==='confirmed'&&!normalizeMobile(d.mobile??''))ctx.addIssue({code:z.ZodIssueCode.custom,path:['mobile'],message:'A valid 10-digit customer mobile number is required.'});
 const labelled=d.lines.reduce((n,l)=>n.plus(l.loyaltyDiscount??0),new Decimal(0));const points=d.redeemPoints??0;
 if(!labelled.mul(100).eq(points))ctx.addIssue({code:z.ZodIssueCode.custom,path:['redeemPoints'],message:'Loyalty discount must equal the points redeemed (100 points = NPR 1).'});
 if(points>0&&d.kind!=='sale')ctx.addIssue({code:z.ZodIssueCode.custom,path:['redeemPoints'],message:'Points can only be redeemed on a sale.'});});
export const paymentInput=paymentPart.extend({businessId:id,documentId:id,periodId:id,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)});
export const counterInput=z.object({businessId:id,id,branchId:id,periodId:id,sessionId:id,kind:z.enum(['open','in','out','close']),amount:money,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),reference:z.string().trim().min(1).max(200)});
export function lineTotals(line:z.infer<typeof commerceLine>){const base=new Decimal(line.quantity).mul(line.price).toDecimalPlaces(2,Decimal.ROUND_HALF_UP).minus(line.discount);const tax=base.mul(line.taxRate).div(100).toDecimalPlaces(2,Decimal.ROUND_HALF_UP);return {base:base.toNumber(),tax:tax.toNumber(),total:base.plus(tax).toNumber()};}
export function cartTotal(lines:z.infer<typeof commerceLine>[]){return lines.reduce((sum,line)=>sum.plus(lineTotals(line).total),new Decimal(0)).toNumber();}
export type CommerceRequest=z.infer<typeof documentInput>;