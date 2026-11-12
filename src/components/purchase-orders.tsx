import {useState} from 'react';
import {ArrowLeft,Plus,Send,FileInput} from 'lucide-react';
import {useCommerce,CommerceFrame,readLines} from './commerce-workspace';
import {DocumentEditor} from './document-editor';
import {Button} from './ui/button';
import {formatNPR,todayAd} from '@/lib/format';
import {whatsappLink} from '@/lib/reminders';
import {orderStatus,statusLabel,daysOpen,orderMessage,type PoStatus,type PoDoc} from '@/lib/purchase-orders';
type Editor={kind:'purchase_order'|'purchase';sourceId?:string};
export function PurchaseOrders(){
 const w=useCommerce();const data=w.commerce.data;const [editor,setEditor]=useState<Editor|null>(null);const [filter,setFilter]=useState<PoStatus|'all'>('pending');const [notice,setNotice]=useState('');
 const docs=(data?.documents??[]) as unknown as PoDoc[];const parties=w.inventory.data?.parties??[];const canWrite=['owner','admin'].includes(data?.role??'');const today=todayAd();
 const orders=docs.filter(d=>d.kind==='purchase_order').map(o=>({o,s:orderStatus(o,docs)})).filter(r=>filter==='all'||r.s===filter).sort((a,b)=>b.o.document_date.localeCompare(a.o.document_date));
 const businessName=w.access.data?.business?.name??'Auraluxe';
 function send(o:PoDoc){const p=parties.find(x=>x.id===o.party_id);const msg=orderMessage(businessName,p?.name??'Supplier',o,readLines(o.lines));const link=p?.phone?whatsappLink(p.phone,msg):null;if(link)window.open(link,'_blank','noopener');else{void navigator.clipboard?.writeText(msg);setNotice('Supplier has no valid mobile; order text copied instead.');}}
 return <CommerceFrame w={w} title="Purchase orders" active="/purchases">{editor?<><Button className="mt-5" variant="ghost" onClick={()=>setEditor(null)}><ArrowLeft/>Orders</Button><h2 className="brand mt-5 text-xl">{editor.kind==='purchase'?'Purchase bill from order':'New purchase order'}</h2><DocumentEditor key={`${editor.kind}:${editor.sourceId??''}`} w={w} kind={editor.kind} sourceId={editor.sourceId} onSaved={()=>setEditor(null)}/></>:<section className="py-6 space-y-5">
  <p className="text-sm text-muted-foreground">Orders never change stock or accounts. Confirm the order to mark it sent, then convert it to a purchase bill when goods arrive.</p>
  <div className="flex flex-wrap items-center gap-2">{canWrite&&<Button onClick={()=>setEditor({kind:'purchase_order'})}><Plus/>New purchase order</Button>}{(['pending','draft','billed_draft','billed','all'] as const).map(f=><Button key={f} size="sm" variant={filter===f?'default':'outline'} onClick={()=>setFilter(f)}>{f==='all'?'All':statusLabel[f]}</Button>)}</div>
  {notice&&<p role="status" className="text-sm">{notice}</p>}
  {!orders.length?<p className="border-y py-10 text-center text-sm text-muted-foreground">No purchase orders in this view.</p>:<div className="divide-y border-y">{orders.map(({o,s})=>{const p=parties.find(x=>x.id===o.party_id);const age=daysOpen(o,today);return <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-semibold">{o.reference} · {p?.name??'No supplier'}</p><p className="text-sm text-muted-foreground">{o.document_date} · {formatNPR(o.total)} · {readLines(o.lines).length} items</p><p className={`text-xs ${s==='pending'&&age>7?'text-destructive font-semibold':'text-muted-foreground'}`}>{statusLabel[s]}{s==='pending'?` · ${age} days open${age>7?' (overdue)':''}`:''}</p></div><div className="flex flex-wrap gap-2">{s!=='draft'&&<Button size="sm" variant="outline" onClick={()=>send(o)}><Send/>Send to supplier</Button>}{s==='draft'&&canWrite&&<Button size="sm" variant="outline" onClick={()=>setEditor({kind:'purchase_order',sourceId:o.id})}>Finish draft</Button>}{s==='pending'&&canWrite&&<Button size="sm" onClick={()=>setEditor({kind:'purchase',sourceId:o.id})}><FileInput/>Convert to purchase bill</Button>}</div></div>;})}</div>}
 </section>}</CommerceFrame>;
}
