import {useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Check,Pencil} from 'lucide-react';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter} from './ui/dialog';
import {getMemberPermissions,saveMemberPermissions} from '@/lib/business.functions';
import {permissionGroups,rolePresets,deniedForRole,allPermissions} from '@/lib/permissions';
import {jobTitles} from '@/lib/job-titles';
export function usePermissionDenials(businessId:string){const fn=useServerFn(getMemberPermissions);return useQuery({queryKey:['permissions',businessId],queryFn:()=>fn({data:{businessId}}),enabled:!!businessId});}
/** True unless the signed-in member's checklist removed this permission. */
export function useCan(businessId:string){const q=usePermissionDenials(businessId);return (p:string)=>q.isSuccess&&!!q.data&&!q.data.denials.some(d=>d.user_id===q.data.userId&&d.permission===p)&&!q.data.roleDenials?.some(d=>d.user_id===q.data.userId&&d.permission===p);}
export function PermissionChecklist({businessId,userId,name,role}:{businessId:string;userId:string;name:string;role?:string}){
 const q=usePermissionDenials(businessId);const save=useServerFn(saveMemberPermissions);const client=useQueryClient();
 const [open,setOpen]=useState(false),[denied,setDenied]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 function start(){setDenied(q.data?.denials.filter(d=>d.user_id===userId).map(d=>d.permission)??[]);setError('');setOpen(true);}
 async function done(){setBusy(true);setError('');try{await save({data:{businessId,userId,denied}});await client.invalidateQueries({queryKey:['permissions',businessId]});setOpen(false);}catch(e){setError(e instanceof Error?e.message:'Not saved.');}finally{setBusy(false);}}
 const roleAllowed = role && role in jobTitles ? jobTitles[role as keyof typeof jobTitles].allowed : role && rolePresets[role] ? rolePresets[role]!.allowed : allPermissions;
 const toggle=(p:string)=>roleAllowed.includes(p)&&setDenied(d=>d.includes(p)?d.filter(x=>x!==p):[...d,p]);
 return <><Button size="sm" variant="outline" onClick={start}><Pencil/>Edit permissions</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{name}'s permissions</DialogTitle></DialogHeader>{role&&role in jobTitles?<Button type="button" size="sm" variant="outline" onClick={()=>setDenied([])}>Clear extra limits</Button>:role&&rolePresets[role]&&<Button type="button" size="sm" variant="outline" onClick={()=>setDenied(deniedForRole(role))}>Use {rolePresets[role]!.label} defaults</Button>}<p className="text-xs text-muted-foreground">Their role sets the maximum access. Untick here only to limit this person further; permissions outside the role ceiling stay disabled.</p><div className="divide-y">{permissionGroups.map(g=><section key={g.title} className="py-3"><h4 className="mb-2 text-sm font-semibold">{g.title}</h4>{g.items.map(({code:p,label})=>{const locked=!roleAllowed.includes(p);const on=!locked&&!denied.includes(p);return <button type="button" key={p} role="checkbox" aria-checked={on} disabled={busy||locked} onClick={()=>toggle(p)} className="flex w-full items-center justify-between py-2 text-left text-sm"><span>{label}</span>{on?<Check className="size-5 text-primary"/>:<span className="size-5 rounded border"/>}</button>;})}</section>)}</div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button disabled={busy} onClick={done}><Check/>{busy?'Saving…':'Done'}</Button></DialogFooter></DialogContent></Dialog></>;
}
