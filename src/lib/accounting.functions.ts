import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {reportInput} from './accounting';
import {businessSnapshotSchema,buildBusinessReport,paginateRows,reportContext} from './business-reports';
import {setResponseHeader} from '@tanstack/react-start/server';
export const getAccountingReport=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).inputValidator(reportInput).handler(async({data,context})=>{
 setResponseHeader('Cache-Control','no-store');
 const result=await context.supabase.rpc('read_business_report_snapshot',{_business_id:data.businessId,...(data.branchId?{_branch_id:data.branchId}:{}),_through:data.to});
 if(result.error)throw new Error('Reports could not be loaded. Check your business and branch access.');
 const snapshot=businessSnapshotSchema.parse(result.data);let docLines:import('./business-reports').DocLines=[];if(data.view==='profit'||data.view==='sales'){for(let o=0;;o+=1000){let q=context.supabase.from('commerce_documents').select('id,kind,document_date,lines').eq('business_id',data.businessId).eq('status','confirmed').in('kind',['sale','sale_return','purchase']).lte('document_date',data.to).order('id').range(o,o+999);if(data.branchId)q=q.eq('branch_id',data.branchId);const r=await q;if(r.error)throw new Error('Reports could not be loaded.');docLines.push(...(r.data??[]));if((r.data?.length??0)<1000)break;}}const report=buildBusinessReport(snapshot,data,docLines);const availableRows=report.hasRecords?report.rows:[];const {rows,total,page}=paginateRows(availableRows,data.page,data.export);
 const sourceIds=new Set(rows.map(r=>r['Source ID']).filter(Boolean));
 return {rows,total,page,totals:report.totals,hasRecords:report.hasRecords,evidence:report.evidence.filter(e=>sourceIds.has(e.source_id)),branches:snapshot.branches,parties:snapshot.parties,periods:snapshot.periods,users:snapshot.users,currency:snapshot.currency,timezone:snapshot.timezone,notice:report.notice,context:reportContext(data,snapshot)};
});