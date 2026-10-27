import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {buildReport,reportInput,snapshotSchema} from './accounting';
export const getAccountingReport=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).inputValidator(reportInput).handler(async({data,context})=>{
 const result=await context.supabase.rpc('read_accounting_snapshot',{_business_id:data.businessId,_branch_id:data.branchId,_through:data.to});
 if(result.error)throw new Error('Reports could not be loaded. Check your business and branch access.');
 const snapshot=snapshotSchema.parse(result.data);const report=buildReport(snapshot,data);const total=report.rows.length;const page=Math.min(data.page,Math.max(1,Math.ceil(total/50)));const rows=data.export?report.rows:report.rows.slice((page-1)*50,page*50);
 const sourceIds=new Set(rows.map(r=>r['Source ID']).filter(Boolean));
 return {rows,total,page,totals:report.totals,hasRecords:report.hasRecords,evidence:report.evidence.filter(e=>sourceIds.has(e.source_id)),branches:snapshot.branches,parties:snapshot.parties,periods:snapshot.periods};
});