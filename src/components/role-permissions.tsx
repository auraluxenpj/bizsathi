import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { Button } from './ui/button';
import { getRoleTemplates, resetRoleTemplate, saveRoleTemplate } from '@/lib/business.functions';
import { permissionGroups } from '@/lib/permissions';
import { jobTitleCodes, jobTitles, type JobTitle } from '@/lib/job-titles';

/** Karobar-style "<Role> Permissions" screen. The owner ticks what each role can do; everyone in that role gets it. */
export function RolePermissions({ businessId, isOwner }: { businessId: string; isOwner: boolean }) {
  const client = useQueryClient();
  const load = useServerFn(getRoleTemplates), save = useServerFn(saveRoleTemplate), reset = useServerFn(resetRoleTemplate);
  const q = useQuery({ queryKey: ['role-templates', businessId], queryFn: () => load({ data: { businessId } }), enabled: !!businessId, retry: false });
  const [title, setTitle] = useState<JobTitle>('sales_person');
  const [denied, setDenied] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const current = q.data?.templates?.[title];
  useEffect(() => { if (current) { setDenied(current.denied); setMessage(''); } }, [current, title]);
  const done = async (text: string) => { setMessage(text); await client.invalidateQueries({ queryKey: ['role-templates', businessId] }); await client.invalidateQueries({ queryKey: ['permissions', businessId] }); };
  const saveMut = useMutation({ mutationFn: () => save({ data: { businessId, jobTitle: title, denied } }), onSuccess: () => done('Saved. Everyone with this role now has this access.'), onError: e => setMessage(e.message) });
  const resetMut = useMutation({ mutationFn: () => reset({ data: { businessId, jobTitle: title } }), onSuccess: () => done('Back to the standard access for this role.'), onError: e => setMessage(e.message) });
  const toggle = (p: string) => isOwner && setDenied(d => d.includes(p) ? d.filter(x => x !== p) : [...d, p]);
  return <section className="border-b py-7">
    <h3 className="brand text-xl">Role permissions</h3>
    <p className="mt-1 text-sm text-muted-foreground">{isOwner ? 'Choose what each role can do. Tap an item to switch it on or off, then press Save.' : 'What each role can do. Only the owner can change this.'}</p>
    <div className="my-4 flex flex-wrap gap-2" role="tablist" aria-label="Role">{jobTitleCodes.map(t => <button key={t} type="button" role="tab" aria-selected={title === t} onClick={() => setTitle(t)} className={`rounded-full border px-4 py-2 text-sm ${title === t ? 'border-primary bg-primary/10 text-primary' : 'bg-card'}`}>{jobTitles[t].label}</button>)}</div>
    {q.isPending && <p role="status" className="text-sm">Loading…</p>}
    {q.error && <p role="alert" className="text-sm text-destructive">Role permissions are not available yet. Run the latest database update first.</p>}
    {current && <>
      <h4 className="mb-1 text-lg font-semibold">{jobTitles[title].label} Permissions {current.customized && <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">Customised</span>}</h4>
      <div className="grid gap-x-8 md:grid-cols-2 lg:grid-cols-3">{permissionGroups.map(g => <section key={g.title} className="border-t py-4"><h5 className="mb-2 text-sm font-semibold">{g.title}</h5>{g.items.map(({ code: p, label }) => { const on = !denied.includes(p); return <button type="button" key={p} role="checkbox" aria-checked={on} disabled={!isOwner} onClick={() => toggle(p)} className="flex w-full items-center gap-3 py-1.5 text-left text-sm disabled:cursor-default">{on ? <Check className="size-5 shrink-0 text-primary" /> : <X className="size-5 shrink-0 text-muted-foreground" />}<span className={on ? '' : 'text-muted-foreground'}>{label}</span></button>; })}</section>)}</div>
      {isOwner && <div className="mt-4 flex flex-wrap gap-2"><Button disabled={saveMut.isPending} onClick={() => saveMut.mutate()}><Check />{saveMut.isPending ? 'Saving…' : 'Save'}</Button>{current.customized && <Button variant="outline" disabled={resetMut.isPending} onClick={() => { if (window.confirm('Go back to the standard access for this role?')) resetMut.mutate(); }}>Reset to standard</Button>}</div>}
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    </>}
  </section>;
}
