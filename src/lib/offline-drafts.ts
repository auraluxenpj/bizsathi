import {z} from 'zod';
import {commerceLine,documentInput,type CommerceRequest} from './commerce-schemas';

export const cacheInput=z.object({userId:z.string().uuid(),businessId:z.string().uuid(),branchId:z.string().uuid(),branchName:z.string(),cachedAt:z.string(),currency:z.string(),vatRegistered:z.boolean(),vatRate:z.number(),products:z.array(z.object({id:z.string().uuid(),name:z.string(),sku:z.string(),barcode:z.string().nullable(),price:z.number(),stock:z.number()})),periods:z.array(z.object({id:z.string().uuid(),name:z.string(),start:z.string(),end:z.string()}))});
export type PosCache=z.infer<typeof cacheInput>;
export const draftInput=z.object({id:z.string().uuid(),createdAt:z.string(),updatedAt:z.string(),state:z.enum(['local','review','uncertain','confirmed','attention']),reference:z.string().trim().min(1).max(200),mobile:z.string().max(40).optional(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),lines:z.array(commerceLine).min(1).max(100),baseline:cacheInput.optional(),request:documentInput.optional(),message:z.string().default('')});
export type LocalDraft=z.infer<typeof draftInput>;
export const vaultInput=z.object({cache:cacheInput,drafts:z.array(draftInput)});
export type DraftVault=z.infer<typeof vaultInput>;
export function scopeKey(userId:string,businessId:string,branchId:string){return `v1:${userId}:${businessId}:${branchId}`;}
export function reviewConflicts(draft:LocalDraft,old:PosCache,current:PosCache){
 const issues:string[]=[];
 if(old.userId!==current.userId||old.businessId!==current.businessId||old.branchId!==current.branchId) return ['Account or branch changed.'];
 if(old.vatRegistered!==current.vatRegistered||old.vatRate!==current.vatRate)issues.push('VAT settings changed.');
 if(!current.periods.some(p=>draft.date>=p.start&&draft.date<=p.end))issues.push('No open period for this date.');
 for(const line of draft.lines){const product=current.products.find(p=>p.id===line.variantId);const previous=old.products.find(p=>p.id===line.variantId);if(!product){issues.push('An item is no longer available.');continue;}if(product.price!==previous?.price)issues.push(`${product.sku}: catalogue price changed.`);if(product.stock<line.quantity)issues.push(`${product.sku}: insufficient current stock.`);if(line.taxRate>0&&(!current.vatRegistered||line.taxRate!==current.vatRate))issues.push(`${product.sku}: VAT rate no longer matches.`);}
 return issues;
}
export function retainAttempt(draft:LocalDraft,request:CommerceRequest):LocalDraft{
 if(draft.request&&JSON.stringify(draft.request)!==JSON.stringify(request))throw new Error('An attempted sale cannot be changed. Check its original identifier.');
 return draftInput.parse({...draft,request,state:'uncertain',updatedAt:new Date().toISOString(),message:'Confirmation awaiting a server status check.'});
}
export function editableDraft(draft:LocalDraft){return !draft.request&&draft.state!=='confirmed';}
function canonical(value:unknown):string{if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>`${JSON.stringify(key)}:${canonical(v)}`).join(',')}}`;return JSON.stringify(value)??'null';}
export function sameSaleRequest(expected:CommerceRequest,stored:unknown){const parsed=documentInput.safeParse(stored);return parsed.success&&canonical(expected)===canonical(parsed.data);}