import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { tenantInput } from './business-schemas';
import { catalogueInput, partyInput, stockInput, variantEditInput } from './inventory-schemas';
import { googleSheetCatalogueInput } from './google-sheet-catalogue';
export const fetchGoogleSheetCatalogue = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(googleSheetCatalogueInput).handler(async ({data,context})=>{
 const {data:member,error}=await context.supabase.rpc('is_business_member',{_business_id:data.businessId});
 const {data:admin,error:roleError}=await context.supabase.rpc('has_business_role',{_business_id:data.businessId,_min_role:'admin'});
 if(error || roleError || !member || !admin) throw new Error('Administrator access to this business is required.');
 const {readGoogleSheetCatalogue}=await import('./google-sheet-catalogue.server');
 try {
  return await readGoogleSheetCatalogue(data,{gatewayKey:process.env['LOVABLE_API_KEY'],connectionKey:process.env['GOOGLE_SHEETS_API_KEY']});
 } catch(error) {
  if(error instanceof Error && (error.name==='TimeoutError' || error.name==='TypeError')) throw new Error('Google Sheets could not be reached. Check the URL and try again.');
  throw error;
 }
});
export const getInventory = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).inputValidator(tenantInput).handler(async ({data,context})=>{
 const {data:member,error:accessError}=await context.supabase.rpc('is_business_member',{_business_id:data.businessId});
 if(accessError || !member) throw new Error('Business access is required.');
 const variants=[]; const parties=[];
 for(let offset=0;;offset+=1000){ const page=await context.supabase.from('product_variants').select('*,products!product_variants_business_id_product_id_fkey(name,category,is_active)').eq('business_id',data.businessId).order('id').range(offset,offset+999); if(page.error) throw new Error('Products could not be loaded.'); variants.push(...(page.data ?? [])); if((page.data?.length ?? 0)<1000) break; }
 for(let offset=0;;offset+=1000){ const page=await context.supabase.from('parties').select('*').eq('business_id',data.businessId).order('id').range(offset,offset+999); if(page.error) throw new Error('Contacts could not be loaded.'); parties.push(...(page.data ?? [])); if((page.data?.length ?? 0)<1000) break; }
 const movements=[];
 for(let offset=0;;offset+=1000){const page=await context.supabase.from('commerce_stock_movements').select('id,variant_id,branch_id,quantity,kind,reference,reason,created_at,document_id').eq('business_id',data.businessId).order('created_at',{ascending:false}).order('id').range(offset,offset+999);if(page.error)throw new Error('Invoice stock history could not be loaded.');movements.push(...(page.data??[]).map(m=>({...m,operation_id:m.document_id})));if((page.data?.length??0)<1000)break;}
 for(let offset=0;;offset+=1000){const page=await context.supabase.from('stock_movements').select('id,variant_id,branch_id,quantity,kind,reference,reason,created_at,operation_id').eq('business_id',data.businessId).order('created_at',{ascending:false}).order('id').range(offset,offset+999);if(page.error)throw new Error('Stock history could not be loaded.');movements.push(...(page.data ?? []));if((page.data?.length ?? 0)<1000)break;}
 const loyalty=[];
 for(let offset=0;;offset+=1000){const page=await context.supabase.rpc('read_customer_loyalty',{_business_id:data.businessId}).order('mobile').range(offset,offset+999);if(page.error)throw new Error('Customer loyalty could not be loaded.');loyalty.push(...(page.data ?? []));if((page.data?.length ?? 0)<1000)break;}
 return {variants,parties,loyalty,movements:movements.sort((a,b)=>b.created_at.localeCompare(a.created_at))};
});
export const saveCatalogue = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(catalogueInput).handler(async ({data,context})=>{
 const {data:count,error}=await context.supabase.rpc('save_catalogue_variant',{_business_id:data.businessId,_rows:data.rows.map(({opening_stock:_o,...row})=>row)});
 if(error) throw new Error('Products were not saved. Check administrator access and duplicate product variants, SKUs or barcodes.');
 const stocked=data.rows.filter(r=>r.opening_stock>0); let opened=0; const skipped:string[]=[];
 if(data.openingBranchId&&stocked.length){
  const ids=new Map<string,string>();
  for(let i=0;i<stocked.length;i+=200){const {data:found}=await context.supabase.from('product_variants').select('id,sku').eq('business_id',data.businessId).in('sku',stocked.slice(i,i+200).map(r=>r.sku));for(const v of found ?? [])ids.set(v.sku,v.id);}
  for(const r of stocked){const variantId=ids.get(r.sku);if(!variantId){skipped.push(r.sku);continue;}
   const {error:stockError}=await context.supabase.rpc('post_stock_request',{_request:{businessId:data.businessId,id:crypto.randomUUID(),variantId,branchId:data.openingBranchId,destinationBranchId:null,kind:'opening',quantity:r.opening_stock,reference:'Item import',reason:'Opening stock from sheet import'}});
   if(stockError)skipped.push(r.sku);else opened++;}
 }
 return {count,opened,skipped};
});
export const editVariant = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(variantEditInput).handler(async ({data,context})=>{
 const {data:allowed,error:accessError}=await context.supabase.rpc('has_business_role',{_business_id:data.businessId,_min_role:'admin'});
 if(accessError || !allowed) throw new Error('Administrator access is required.');
 const v=data.values; const {data:saved,error}=await context.supabase.from('product_variants').update({name:v.variant_name,sku:v.sku,model_code:v.model_code || null,barcode:v.barcode || null,unit:v.unit,selling_price:v.selling_price,purchase_price:v.purchase_price,mrp:v.mrp,wholesale_price:v.wholesale_price,reorder_level:v.reorder_level,is_active:v.is_active}).eq('business_id',data.businessId).eq('id',data.id).select('id').single();
 if(error || !saved) throw new Error('Variant could not be updated. Check unique SKU and barcode.'); return {ok:true};
});
export const saveParty = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(partyInput).handler(async ({data,context})=>{
 const {data:allowed,error:accessError}=await context.supabase.rpc('has_business_role',{_business_id:data.businessId,_min_role:'admin'});
 if(accessError || !allowed) throw new Error('Administrator access is required.');
 const {businessId,id,...values}=data; const query=id ? context.supabase.from('parties').update(values).eq('business_id',businessId).eq('id',id) : context.supabase.from('parties').insert({...values,business_id:businessId});
 const {data:saved,error}=await query.select('id').single(); if(error || !saved)throw new Error('Contact could not be saved.');return {ok:true};
});
export const postStock = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(stockInput).handler(async ({data,context})=>{
 const {data:id,error}=await context.supabase.rpc('post_stock_request',{_request:data});
 if(error) throw new Error('Stock was not confirmed. Check access, available stock, active branches, and whether opening stock was already recorded. Retry unchanged input if the connection was interrupted.');return {id};
});