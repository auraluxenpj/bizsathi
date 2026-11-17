import {useMemo,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Link} from '@tanstack/react-router';
import {Check,RotateCcw,XCircle} from 'lucide-react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {formatNPR,formatBsAd} from '@/lib/format';
import {readLines,type CommerceWorkspace} from './commerce-workspace';
import {createSaleReturnRequest,listSaleReturnRequests,reviewSaleReturnRequest} from '@/lib/return-requests.functions';

type RequestRow={
 id:string;business_id:string;branch_id:string;source_sale_id:string;requested_lines:{variantId:string;quantity:number}[];
 reason:string;status:'pending'|'approved'|'rejected';requested_by:string;created_at:string;
 reviewed_by:string|null;reviewed_at:string|null;decision_reason:string|null;return_document_id:string|null;
};
export function SaleReturnRequests({w,manager,cashier}:{w:CommerceWorkspace;manager:boolean;cashier:boolean}){
 const client=useQueryClient();const data=w.commerce.data;const businessId=w.businessId;
 const listFn=useServerFn(listSaleReturnRequests);const createFn=useServerFn(createSaleReturnRequest);const reviewFn=useServerFn(reviewSaleReturnRequest);
 const requests=useQuery({queryKey:['sale-return-requests',businessId],queryFn:()=>listFn({data:{businessId}}),enabled:!!businessId,staleTime:0});
 const [sourceId,setSourceId]=useState('');const [reason,setReason]=useState('');const [quantities,setQuantities]=useState<Record<string,string>>({});
 const [branch,setBranch]=useState('');const [reviewReasons,setReviewReasons]=useState<Record<string,string>>({});
 const [message,setMessage]=useState('');
 const source=data?.documents.find(d=>d.id===sourceId&&d.kind==='sale'&&d.status==='confirmed');
 const sales=(data?.documents??[]).filter(d=>d.kind==='sale'&&d.status==='confirmed'&&(!branch||d.branch_id===branch));
 const pendingForSource=(requests.data??[]).filter(r=>r.source_sale_id===sourceId&&r.status==='pending');
 const available=useMemo(()=>{
   const confirmed=(data?.documents??[]).filter(d=>d.source_id===sourceId&&d.kind==='sale_return'&&d.status==='confirmed');
   const lines=source?readLines(source.lines):[];
   return lines.map(line=>{
     const returned=confirmed.flatMap(d=>readLines(d.lines)).filter(l=>l.variantId===line.variantId).reduce((n,l)=>n+l.quantity,0);
     const reserved=pendingForSource.flatMap(r=>r.requested_lines).filter(l=>l.variantId===line.variantId).reduce((n,l)=>n+Number(l.quantity),0);
     return {...line,remaining:Math.max(0,line.quantity-returned-reserved)};
   });
 },[data?.documents,source,pendingForSource]);
 const create=useMutation({mutationFn:()=>createFn({data:{businessId,sourceSaleId:sourceId,reason,lines:available.filter(l=>Number(quantities[l.variantId]??0)>0).map(l=>({variantId:l.variantId,quantity:Number(quantities[l.variantId])}))}}),onSuccess:async()=>{setMessage('Return request submitted for manager review. No stock or accounts were changed.');setReason('');setQuantities({});setSourceId('');await client.invalidateQueries({queryKey:['sale-return-requests',businessId]});},onError:e=>setMessage(e.message)});
 const review=useMutation({mutationFn:(v:{requestId:string;decision:'approve'|'reject';reason?:string})=>reviewFn({data:{...v,...(v.decision==='approve'?{periodId:approvalPeriod?.id,date:today}: {})}}),onSuccess:async result=>{setMessage(result.documentId?'Return approved and posted. Record any refund from the approved return invoice.':'Return request rejected. Reserved quantities have been released.');await client.invalidateQueries();},onError:e=>setMessage(e.message)});
 const branches=w.access.data?.branches??[];const today=new Date().toLocaleDateString('en-CA');const approvalPeriod=data?.periods.find(p=>p.status==='open'&&today>=p.start_date&&today<=p.end_date);
 const canSubmit=!!source&&reason.trim().length>=3&&available.some(l=>Number(quantities[l.variantId]??0)>0&&Number(quantities[l.variantId])<=l.remaining)&&!create.isPending;
 return <section className="my-7 space-y-5 border-y py-6" aria-label="Sale return requests">
   <div><h2 className="text-lg font-semibold">Sale return requests</h2><p className="mt-1 text-sm text-muted-foreground">{cashier?'Submit a return for review. Stock and refunds are not changed until a Branch Manager approves it.':'Review requests for your authorized branches. Approval posts the linked sale return and stock reversal; refunds are a separate recorded payment.'}</p></div>
   {cashier&&<div className="grid gap-3 rounded-xl border p-4">
     <h3 className="font-medium">Request a return</h3>
     <label className="grid gap-1 text-sm">Branch<select aria-label="Return request branch" className="h-10 rounded-md border bg-card px-3" value={branch} onChange={e=>{setBranch(e.target.value);setSourceId('');setQuantities({});}}><option value="">All assigned branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
     <label className="grid gap-1 text-sm">Original sale<select aria-label="Original sale" className="h-10 rounded-md border bg-card px-3" value={sourceId} onChange={e=>{setSourceId(e.target.value);setQuantities({});}}><option value="">Choose a confirmed sale</option>{sales.filter(d=>!branch||d.branch_id===branch).map(d=><option key={d.id} value={d.id}>{d.reference} · {formatBsAd(d.document_date)} · {formatNPR(d.total)}</option>)}</select></label>
     {source&&<div className="space-y-2">{available.map(line=><div key={line.variantId} className="grid grid-cols-[1fr_6rem] items-center gap-3 text-sm"><div className="min-w-0"><p className="truncate font-medium">{line.name}</p><p className="text-xs text-muted-foreground">Sold {line.quantity} · available {line.remaining}</p></div><Input aria-label={`Return quantity ${line.name}`} type="number" min="0" max={line.remaining} step="0.001" value={quantities[line.variantId]??''} disabled={line.remaining<=0} onChange={e=>setQuantities(v=>({...v,[line.variantId]:e.target.value}))}/></div>)}</div>}
     <label className="grid gap-1 text-sm">Reason for return<textarea aria-label="Return reason" className="min-h-20 rounded-md border bg-card p-3" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Describe the customer's return reason"/></label>
     <div className="flex flex-wrap items-center gap-3"><Button disabled={!canSubmit} onClick={()=>create.mutate()}><RotateCcw className="mr-2 size-4"/>Submit for approval</Button><span className="text-xs text-muted-foreground">Quantities are reserved while the request is pending.</span></div>
   </div>}
   {message&&<p role="status" className="text-sm">{message}</p>}
   {requests.isPending?<p role="status" className="text-sm text-muted-foreground">Loading return requests…</p>:requests.error?<p role="alert" className="text-sm text-destructive">{requests.error.message}</p>:!(requests.data??[]).length?<p className="text-sm text-muted-foreground">No return requests yet.</p>:<div className="space-y-3">{(requests.data as RequestRow[]).map(r=>{
     const original=data?.documents.find(d=>d.id===r.source_sale_id);
     const canReview=manager&&r.status==='pending';
     return <article key={r.id} className="rounded-xl border p-4">
       <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{original?.reference??'Original sale'} <span className="text-xs font-normal text-muted-foreground">· {r.status}</span></p><p className="mt-1 text-xs text-muted-foreground">{formatBsAd(r.created_at.slice(0,10))} · {branches.find(b=>b.id===r.branch_id)?.name??'Assigned branch'}</p></div>{r.return_document_id&&<Button asChild size="sm" variant="outline"><Link to="/sales" search={{kind:'sale_return',document:r.return_document_id}}>Open posted return</Link></Button>}</div>
       <ul className="mt-3 space-y-1 text-sm">{r.requested_lines.map(line=>{const product=original?readLines(original.lines).find(l=>l.variantId===line.variantId):undefined;return <li key={line.variantId}>{product?.name??line.variantId} · Qty {line.quantity}</li>;})}</ul>
       <p className="mt-2 text-sm"><span className="font-medium">Reason:</span> {r.reason}</p>
       {r.status==='rejected'&&<p className="mt-2 text-sm text-destructive">Rejected: {r.decision_reason}</p>}
       {canReview&&<div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><Input aria-label={`Decision reason ${r.id}`} placeholder="Reason if rejecting" value={reviewReasons[r.id]??''} onChange={e=>setReviewReasons(v=>({...v,[r.id]:e.target.value}))}/><Button disabled={review.isPending||!approvalPeriod} onClick={()=>review.mutate({requestId:r.id,decision:'approve'})}><Check className="mr-1 size-4"/>Approve & post</Button><Button variant="destructive" disabled={review.isPending||(reviewReasons[r.id]??'').trim().length<3} onClick={()=>review.mutate({requestId:r.id,decision:'reject',reason:reviewReasons[r.id]})}><XCircle className="mr-1 size-4"/>Reject</Button></div>}
       {r.status==='approved'&&r.reviewed_at&&<p className="mt-2 text-xs text-muted-foreground">Approved {formatBsAd(r.reviewed_at.slice(0,10))}.</p>}
     </article>;
   })}</div>}
 </section>;
}
