import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { tenantInput } from './business-schemas';
import { catalogueInput, partyInput, stockInput, variantEditInput } from './inventory-schemas';
export const getInventory = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).inputValidator(tenantInput).handler(async ({data,context})=>{
 const {data:member,error:accessError}=await context.supabase.rpc('is_business_member',{_business_id:data.businessId});
 if(accessError || !member) throw new Error('Business access is required.');
 const variants=[]; const parties=[];
 for(let offset=0;;offset+=1000){ const page=await context.supabase.from('product_variants').select('*,products!product_variants_business_id_product_id_fkey(name,category,is_active)').eq('business_id',data.businessId).order('id').range(offset,offset+999); if(page.error) throw new Error('Products could not be loaded.'); variants.push(...(page.data ?? [])); if((page.data?.length ?? 0)<1000) break; }
 for(let offset=0;;offset+=1000){ const page=await context.supabase.from('parties').select('*').eq('business_id',data.businessId).order('id').range(offset,offset+999); if(page.error) throw new Error('Contacts could not be loaded.'); parties.push(...(page.data ?? [])); if((page.data?.length ?? 0)<1000) break; }
 const movements=[];
 for(let offset=0;;offset+=1000){const page=await context.supabase.from('stock_movements').select('id,variant_id,branch_id,quantity,kind,reference,reason,created_at,operation_id').eq('business_id',data.businessId).order('created_at',{ascending:false}).order('id').range(offset,offset+999);if(page.error)throw new Error('Stock history could not be loaded.');movements.push(...(page.data ?? []));if((page.data?.length ?? 0)<1000)break;}
 return {variants,parties,movements};
});
export const saveCatalogue = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(catalogueInput).handler(async ({data,context})=>{
 const {data:count,error}=await context.supabase.rpc('save_catalogue_variant',{_business_id:data.businessId,_rows:data.rows});
 if(error) throw new Error('Products were not saved. Check administrator access and duplicate product variants, SKUs or barcodes.');
 return {count};
});
export const editVariant = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(variantEditInput).handler(async ({data,context})=>{
 const {data:allowed,error:accessError}=await context.supabase.rpc('has_business_role',{_business_id:data.businessId,_min_role:'admin'});
 if(accessError || !allowed) throw new Error('Administrator access is required.');
 const v=data.values; const {data:saved,error}=await context.supabase.from('product_variants').update({name:v.variant_name,sku:v.sku,barcode:v.barcode || null,unit:v.unit,selling_price:v.selling_price,reorder_level:v.reorder_level,is_active:v.is_active}).eq('business_id',data.businessId).eq('id',data.id).select('id').single();
 if(error || !saved) throw new Error('Variant could not be updated. Check unique SKU and barcode.'); return {ok:true};
});
export const saveParty = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(partyInput).handler(async ({data,context})=>{
 const {data:allowed,error:accessError}=await context.supabase.rpc('has_business_role',{_business_id:data.businessId,_min_role:'admin'});
 if(accessError || !allowed) throw new Error('Administrator access is required.');
 const {businessId,id,...values}=data; const query=id ? context.supabase.from('parties').update(values).eq('business_id',businessId).eq('id',id) : context.supabase.from('parties').insert({...values,business_id:businessId});
 const {data:saved,error}=await query.select('id').single(); if(error || !saved)throw new Error('Contact could not be saved.');return {ok:true};
});
export const postStock = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(stockInput).handler(async ({data,context})=>{
 const {data:id,error}=await context.supabase.rpc('post_stock_operation',{_business_id:data.businessId,_id:data.id,_variant_id:data.variantId,_branch_id:data.branchId,_destination_branch_id:data.destinationBranchId,_kind:data.kind,_quantity:data.quantity,_reference:data.reference,_reason:data.reason});
 if(error) throw new Error('Stock was not confirmed. Check access, available stock, active branches, and whether opening stock was already recorded. Retry unchanged input if the connection was interrupted.');return {id};
});