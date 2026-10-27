import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {setResponseHeader} from '@tanstack/react-start/server';
import Decimal from 'decimal.js';
import {z} from 'zod';
import {cacheInput,sameSaleRequest} from './offline-drafts';
import {storedDocumentInput} from './commerce-schemas';

export const checkOfflineSale=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(storedDocumentInput).handler(async({data,context})=>{
 setResponseHeader('Cache-Control','no-store');
 const result=await context.supabase.from('commerce_documents').select('id,status,kind,actor_id,request').eq('business_id',data.businessId).eq('branch_id',data.branchId).eq('id',data.id).maybeSingle();
 if(result.error)throw new Error('Sale status could not be checked. Keep the same request.');
 if(!result.data)return null;
 if(result.data.actor_id!==context.userId||result.data.kind!=='sale'||result.data.status!=='confirmed'||!sameSaleRequest(data,result.data.request))throw new Error('This identifier belongs to a different document. Encrypted request retained; do not submit a replacement.');
 return{id:result.data.id};
});

export const getOfflinePosCache=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).inputValidator(z.object({businessId:z.string().uuid(),branchId:z.string().uuid()})).handler(async({data,context})=>{
 setResponseHeader('Cache-Control','no-store');
 const [role,access]=await Promise.all([context.supabase.rpc('has_business_role',{_business_id:data.businessId,_min_role:'staff'}),context.supabase.rpc('can_access_branch',{_business_id:data.businessId,_branch_id:data.branchId})]);
 if(role.error||access.error||!role.data||!access.data)return {ok:false as const,reason:'Sale access is no longer available. Encrypted drafts are retained.'};
 const [branch,settings,periods]=await Promise.all([context.supabase.from('branches').select('id,name,is_active').eq('business_id',data.businessId).eq('id',data.branchId).single(),context.supabase.from('business_settings').select('currency,vat_registered,vat_rate').eq('business_id',data.businessId).single(),context.supabase.from('financial_periods').select('id,name,start_date,end_date').eq('business_id',data.businessId).eq('status','open')]);
 if(branch.error||settings.error||periods.error)throw new Error('Current trading settings could not be checked.');
 if(!branch.data.is_active)return{ok:false as const,reason:'Branch is inactive. Encrypted drafts are retained.'};
 const variants=[];for(let offset=0;;offset+=1000){const r=await context.supabase.from('product_variants').select('id,name,sku,barcode,selling_price,products!product_variants_business_id_product_id_fkey(name,is_active)').eq('business_id',data.businessId).eq('is_active',true).order('id').range(offset,offset+999);if(r.error)throw new Error('Current product prices could not be checked.');variants.push(...(r.data??[]));if((r.data?.length??0)<1000)break;}
 const balances=new Map<string,Decimal>();
 for(const table of ['stock_movements','commerce_stock_movements'] as const){for(let offset=0;;offset+=1000){const r=await context.supabase.from(table).select('id,variant_id,quantity').eq('business_id',data.businessId).eq('branch_id',data.branchId).order('id').range(offset,offset+999);if(r.error)throw new Error('Current stock could not be checked.');for(const m of r.data??[])balances.set(m.variant_id,(balances.get(m.variant_id)??new Decimal(0)).plus(m.quantity));if((r.data?.length??0)<1000)break;}}
 const cache=cacheInput.parse({userId:context.userId,...data,branchName:branch.data.name,cachedAt:new Date().toISOString(),currency:settings.data.currency,vatRegistered:settings.data.vat_registered,vatRate:Number(settings.data.vat_rate),periods:periods.data.map(p=>({id:p.id,name:p.name,start:p.start_date,end:p.end_date})),products:variants.filter(v=>v.products?.is_active).map(v=>({id:v.id,name:`${v.products?.name} · ${v.name}`,sku:v.sku,barcode:v.barcode,price:Number(v.selling_price),stock:(balances.get(v.id)??new Decimal(0)).toNumber()}))});
 return{ok:true as const,cache};
});