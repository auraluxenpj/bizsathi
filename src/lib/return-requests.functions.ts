import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
// The migration is additive; generated Supabase table/RPC types are refreshed separately.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db=(client:unknown)=>client as SupabaseClient<any,'public',any>;

const id=z.string().uuid();
const requestInput=z.object({
  businessId:id,sourceSaleId:id,
  lines:z.array(z.object({variantId:id,quantity:z.number().finite().positive().max(999999).refine(n=>Number.isInteger(n*1000),'Use at most three decimal places.')})).min(1).max(100),
  reason:z.string().trim().min(3).max(500),
});
const reviewInput=z.object({
  requestId:id,decision:z.enum(['approve','reject']),reason:z.string().trim().max(500).optional(),
  periodId:id.optional(),date:z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
});

export const listSaleReturnRequests=createServerFn({method:'GET'})
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({businessId:id}))
  .handler(async({data,context})=>{
    const member=await db(context.supabase).rpc('is_business_member',{_business_id:data.businessId});
    if(member.error||!member.data)throw new Error('Business access required.');
    const result=await db(context.supabase).from('sale_return_requests')
      .select('id,business_id,branch_id,source_sale_id,requested_lines,reason,status,requested_by,created_at,reviewed_by,reviewed_at,decision_reason,return_document_id,reserved_document_id')
      .eq('business_id',data.businessId).order('created_at',{ascending:false}).limit(200);
    if(result.error)throw new Error('Return requests could not be loaded.');
    return result.data??[];
  });

export const createSaleReturnRequest=createServerFn({method:'POST'})
  .middleware([requireSupabaseAuth])
  .inputValidator(requestInput)
  .handler(async({data,context})=>{
    const result=await context.supabase.rpc('request_sale_return',{
      _business_id:data.businessId,_source_sale_id:data.sourceSaleId,
      _lines:data.lines,_reason:data.reason,
    });
    if(result.error)throw new Error(result.error.message||'Return request could not be submitted.');
    return {id:result.data as string};
  });

export const reviewSaleReturnRequest=createServerFn({method:'POST'})
  .middleware([requireSupabaseAuth])
  .inputValidator(reviewInput)
  .handler(async({data,context})=>{
    if(data.decision==='approve'&&(!data.periodId||!data.date))throw new Error('Choose an open financial period and approval date.');
    if(data.decision==='reject'&&!data.reason?.trim())throw new Error('Enter a reason for rejection.');
    const result=await context.supabase.rpc('review_sale_return_request',{
      _request_id:data.requestId,_decision:data.decision,_reason:data.reason??null,
      _period_id:data.periodId??null,_date:data.date??new Date().toLocaleDateString('en-CA'),
    });
    if(result.error)throw new Error(result.error.message||'Return request could not be reviewed.');
    return {documentId:result.data as string|null};
  });
