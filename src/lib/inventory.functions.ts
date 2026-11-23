import type { Json } from '@/integrations/supabase/types';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { tenantInput } from './business-schemas';
import { catalogueInput, catalogueBranchImportInput, partyInput, stockInput, variantEditInput } from './inventory-schemas';
import { googleSheetCatalogueInput } from './google-sheet-catalogue';
export const fetchGoogleSheetCatalogue = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(googleSheetCatalogueInput).handler(async ({data,context})=>{
 const {data:member,error}=await context.supabase.rpc('is_business_member',{_business_id:data.businessId});
 const {data:admin,error:roleError}=await context.supabase.rpc('has_business_role',{_business_id:data.businessId,_min_role:'admin'});
 if(error || roleError || !member || !admin) throw new Error('Administrator access to this business is required.');
 const {readGoogleSheetCatalogue}=await import('./google-sheet-catalogue.server');
 try {
  return await readGoogleSheetCatalogue(data,{serviceAccountJson:process.env['GOOGLE_SERVICE_ACCOUNT_JSON']});
 } catch(error) {
  if(error instanceof Error && (error.name==='TimeoutError' || error.name==='TypeError')) throw new Error('Google Sheets could not be reached. Check the URL and try again.');
  throw error;
 }
});
export const getInventory = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).inputValidator(tenantInput).handler(async ({data,context})=>{
 const {data:member,error:accessError}=await context.supabase.rpc('is_business_member',{_business_id:data.businessId});
 if(accessError || !member) throw new Error('Business access is required.');
 const variants=[]; const parties=[];
 for(let offset=0;;offset+=1000){ const page=await context.supabase.from('product_variants').select('*,products!product_variants_business_id_product_id_fkey(name,category,is_active,catalogue_sizes)').eq('business_id',data.businessId).order('id').range(offset,offset+999); if(page.error) throw new Error('Products could not be loaded.'); variants.push(...(page.data ?? [])); if((page.data?.length ?? 0)<1000) break; }
 for(let offset=0;;offset+=1000){ const page=await context.supabase.from('parties').select('*').eq('business_id',data.businessId).order('id').range(offset,offset+999); if(page.error) throw new Error('Contacts could not be loaded.'); parties.push(...(page.data ?? [])); if((page.data?.length ?? 0)<1000) break; }
 const movements=[];
 for(let offset=0;;offset+=1000){const page=await context.supabase.from('commerce_stock_movements').select('id,variant_id,branch_id,quantity,kind,reference,reason,created_at,document_id').eq('business_id',data.businessId).order('created_at',{ascending:false}).order('id').range(offset,offset+999);if(page.error)throw new Error('Invoice stock history could not be loaded.');movements.push(...(page.data??[]).map(m=>({...m,operation_id:m.document_id})));if((page.data?.length??0)<1000)break;}
 for(let offset=0;;offset+=1000){const page=await context.supabase.from('stock_movements').select('id,variant_id,branch_id,quantity,kind,reference,reason,created_at,operation_id').eq('business_id',data.businessId).order('created_at',{ascending:false}).order('id').range(offset,offset+999);if(page.error)throw new Error('Stock history could not be loaded.');movements.push(...(page.data ?? []));if((page.data?.length ?? 0)<1000)break;}
 const loyalty=[];
 for(let offset=0;;offset+=1000){const page=await context.supabase.rpc('read_customer_loyalty',{_business_id:data.businessId}).order('mobile').range(offset,offset+999);if(page.error)throw new Error('Customer loyalty could not be loaded.');loyalty.push(...(page.data ?? []));if((page.data?.length ?? 0)<1000)break;}
 const {data:seesCost,error:costError}=await context.supabase.rpc('has_permission',{_business:data.businessId,_perm:'other.purchase_price'});
 const safeVariants=costError||seesCost!==true?variants.map(v=>({...v,purchase_price:0})):variants; // fail closed: cost never leaves the server without permission
 return {variants:safeVariants,parties,loyalty,canViewPurchasePrice:!costError&&seesCost===true,movements:movements.sort((a,b)=>b.created_at.localeCompare(a.created_at))};
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
export const importCatalogueBranchStock = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(catalogueBranchImportInput).handler(async ({data,context})=>{
 const {data:result,error}=await context.supabase.rpc('import_catalogue_branch_stock',{
  _business_id:data.businessId,
  _branch_id:data.branchId,
  _rows:data.rows.map(({opening_stock,...row})=>({...row,opening_stock})),
 });
 if(error) throw new Error(error.message.includes('different model code') ? error.message : 'CSV stock import failed. No rows were applied. Check branch access, duplicate SKUs, prices and quantities.');
 for (const row of data.rows) {
  const {data:variant,error:variantError}=await context.supabase.from('product_variants').select('product_id').eq('business_id',data.businessId).eq('sku',row.sku).single();
  if(variantError || !variant) throw new Error(`Sizes could not be saved for SKU ${row.sku}.`);
  const sizes=[...new Set(row.sizes.split(',').map(s=>s.trim()).filter(Boolean))];
  const {error:sizeError}=await context.supabase.from('products').update({catalogue_sizes:sizes}).eq('business_id',data.businessId).eq('id',variant.product_id);
  if(sizeError) throw new Error(`Sizes could not be saved for SKU ${row.sku}.`);
 }
 return result as {inserted:number;updated:number;stock_adjusted:number;branch_id:string};
});
export const editVariant = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(variantEditInput).handler(async ({data,context})=>{
 const {data:allowed,error:accessError}=await context.supabase.rpc('has_business_role',{_business_id:data.businessId,_min_role:'admin'});
 if(accessError || !allowed) throw new Error('Administrator access is required.');
 const v=data.values;
 const {data:existing,error:existingError}=await context.supabase.from('product_variants').select('product_id').eq('business_id',data.businessId).eq('id',data.id).single();
 if(existingError || !existing) throw new Error('Product could not be found.');
 const sizes=[...new Set(v.sizes.split(',').map(s=>s.trim()).filter(Boolean))];
 const {error:sizeError}=await context.supabase.from('products').update({catalogue_sizes:sizes}).eq('business_id',data.businessId).eq('id',existing.product_id);
 if(sizeError) throw new Error('Product sizes could not be updated.');
 const {data:saved,error}=await context.supabase.from('product_variants').update({name:v.variant_name,sku:v.sku,model_code:v.model_code || null,barcode:v.barcode || null,unit:v.unit,selling_price:v.selling_price,purchase_price:v.purchase_price,mrp:v.mrp,wholesale_price:v.wholesale_price,reorder_level:v.reorder_level,is_active:v.is_active}).eq('business_id',data.businessId).eq('id',data.id).select('id').single();
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

const countLineInput = z.object({
  variantId: z.string().uuid(),
  physicalQuantity: z.number().int().nonnegative().max(999999999).nullable(),
  costPrice: z.number().finite().nonnegative().max(999999999).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001).nullable().optional(),
  note: z.string().max(500).optional(),
});
const countDateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const createCountSessionInput = z.object({
  businessId: z.string().uuid(),
  branchId: z.string().uuid(),
  countDate: countDateInput,
  countedBy: z.string().trim().min(1).max(120),
  lines: z.array(countLineInput).max(10000),
});
const updateCountSessionInput = z.object({
  sessionId: z.string().uuid(),
  countDate: countDateInput,
  countedBy: z.string().trim().min(1).max(120),
  lines: z.array(countLineInput).max(10000),
});
const countSessionIdInput = z.object({ sessionId: z.string().uuid() });
const reviewCountSessionInput = z.object({
  sessionId: z.string().uuid(),
  decision: z.enum(['approved','rejected']),
  note: z.string().max(1000).optional(),
});

const countLinesToRpc = (lines: z.infer<typeof countLineInput>[]) => lines.map(line => ({
  variant_id: line.variantId,
  physical_quantity: line.physicalQuantity,
  cost_price: line.costPrice ?? null,
  note: line.note ?? null,
}));

export const createInventoryCountSession = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(createCountSessionInput).handler(async ({data,context}) => {
  const {data:sessionId,error} = await context.supabase.rpc('create_inventory_count_session', {
    _business_id:data.businessId,
    _branch_id:data.branchId,
    _count_date:data.countDate,
    _counted_by:data.countedBy,
    _lines:countLinesToRpc(data.lines),
  });
  if(error || !sessionId) throw new Error('Inventory count could not be saved. Check branch access and the entered quantities.');
  return {sessionId};
});

export const updateInventoryCountSession = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(updateCountSessionInput).handler(async ({data,context}) => {
  const {data:updated,error} = await context.supabase.rpc('update_inventory_count_session', {
    _session_id:data.sessionId,
    _count_date:data.countDate,
    _counted_by:data.countedBy,
    _lines:countLinesToRpc(data.lines),
  });
  if(error || updated !== true) throw new Error('Draft could not be updated. It may already have been submitted or reviewed.');
  return {ok:true};
});

export const listInventoryCountSessions = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).inputValidator(tenantInput).handler(async ({data,context}) => {
  const {data:sessions,error} = await context.supabase.rpc('list_inventory_count_sessions',{_business_id:data.businessId});
  if(error) throw new Error('Inventory count history could not be loaded.');
  return sessions ?? [];
});

export const readInventoryCountSession = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).inputValidator(countSessionIdInput).handler(async ({data,context}) => {
  const {data:session,error} = await context.supabase.rpc('read_inventory_count_session',{_session_id:data.sessionId});
  if(error || !session) throw new Error('Inventory count could not be opened.');
  return session;
});

export const submitInventoryCountSession = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(countSessionIdInput).handler(async ({data,context}) => {
  const {data:submitted,error} = await context.supabase.rpc('submit_inventory_count_session',{_session_id:data.sessionId});
  if(error || submitted !== true) throw new Error('Inventory count could not be submitted.');
  return {ok:true};
});


const countAdjustmentInput = z.object({ sessionId: z.string().uuid() });
type UntypedRpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: Json; error: unknown }>;
const confirmCountAdjustmentInput = z.object({
  sessionId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

export const readInventoryCountAdjustment = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).inputValidator(countAdjustmentInput).handler(async ({data,context}) => {
  const {data:adjustment,error} = await (context.supabase.rpc as unknown as UntypedRpc)('read_inventory_count_adjustment',{_session_id:data.sessionId});
  if(error) throw new Error('Stock adjustment proposal could not be loaded.');
  return adjustment;
});

export const prepareInventoryCountAdjustment = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(countAdjustmentInput).handler(async ({data,context}) => {
  const {data:adjustment,error} = await (context.supabase.rpc as unknown as UntypedRpc)('prepare_inventory_count_adjustment',{_session_id:data.sessionId});
  if(error || !adjustment) throw new Error('Stock adjustment proposal could not be prepared. Confirm the count is approved and you have Branch Manager or Administrator approval access.');
  return adjustment;
});

export const confirmInventoryCountAdjustment = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(confirmCountAdjustmentInput).handler(async ({data,context}) => {
  const {data:adjustment,error} = await (context.supabase.rpc as unknown as UntypedRpc)('confirm_inventory_count_adjustment',{
    _session_id:data.sessionId,
    _reason:data.reason,
  });
  if(error || !adjustment) throw new Error('Stock adjustment was not posted. Stock may have changed; refresh the proposal and check its status.');
  return adjustment;
});

export const reviewInventoryCountSession = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(reviewCountSessionInput).handler(async ({data,context}) => {
  const {data:reviewed,error} = await context.supabase.rpc('review_inventory_count_session',{
    _session_id:data.sessionId,
    _decision:data.decision,
    ...(data.note===undefined?{}:{_note:data.note}),
  });
  if(error || reviewed !== true) throw new Error('Inventory count review could not be saved. The reviewer must be a different authorized Branch Manager or Administrator.');
  return {ok:true};
});
