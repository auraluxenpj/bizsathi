import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Camera, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DualDateInput } from './dual-date-input';
import { WorkspacePage, type WorkspaceContext } from './workspace-page';
import { supabase } from '@/integrations/supabase/client';
import { deleteBill, listBills, registerBill, saveBillMeta } from '@/lib/workspace.functions';
import { billPath, checkBillFile, type BillRow, type BillType } from '@/lib/workspace-schemas';
import { formatBsAd, todayAd } from '@/lib/format';

function Viewer({ ctx, bill, mine, onClose }: { ctx: WorkspaceContext; bill: BillRow; mine: boolean; onClose: () => void }) {
  const client = useQueryClient(); const save = useServerFn(saveBillMeta); const remove = useServerFn(deleteBill);
  const [caption, setCaption] = useState(bill.caption); const [date, setDate] = useState(bill.bill_date); const [error, setError] = useState('');
  const editable = ctx.canWrite && (mine || ctx.canAdmin);
  const done = () => { client.invalidateQueries({ queryKey: ['bills', ctx.businessId] }); onClose(); };
  const saving = useMutation({ mutationFn: () => save({ data: { businessId: ctx.businessId, id: bill.id, caption, billDate: date } }), onSuccess: done, onError: e => setError(e instanceof Error ? e.message : 'Could not save.') });
  const deleting = useMutation({ mutationFn: () => remove({ data: { businessId: ctx.businessId, id: bill.id } }), onSuccess: done, onError: e => setError(e instanceof Error ? e.message : 'Could not delete.') });
  return <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>Bill</DialogTitle><DialogDescription>{formatBsAd(bill.bill_date)}</DialogDescription></DialogHeader>
      {bill.url ? (bill.mime_type === 'application/pdf'
        ? <Button asChild variant="outline" className="h-12"><a href={bill.url} target="_blank" rel="noreferrer"><FileText />Open PDF</a></Button>
        : <a href={bill.url} target="_blank" rel="noreferrer"><img src={bill.url} alt={bill.caption || 'Bill'} className="max-h-96 w-full rounded-lg border object-contain" /></a>)
        : <p className="text-sm text-muted-foreground">Preview unavailable. Try reloading.</p>}
      <div className="space-y-3">
        <label className="block text-sm">Caption<Input aria-label="Bill caption" className="mt-1 h-11" maxLength={200} disabled={!editable} value={caption} onChange={e => setCaption(e.target.value)} /></label>
        {editable && <DualDateInput value={date} onChange={setDate} label="Bill date" />}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {editable && <div className="flex gap-2"><Button className="h-11 flex-1" disabled={saving.isPending} onClick={() => { setError(''); saving.mutate(); }}>{saving.isPending ? 'Saving…' : 'Save'}</Button><Button variant="outline" className="h-11 text-destructive" disabled={deleting.isPending} onClick={() => { if (window.confirm('Delete this bill and its file?')) deleting.mutate(); }}><Trash2 />Delete</Button></div>}
      </div>
    </DialogContent>
  </Dialog>;
}

function Body({ ctx }: { ctx: WorkspaceContext }) {
  const client = useQueryClient(); const load = useServerFn(listBills); const register = useServerFn(registerBill);
  const bills = useQuery({ queryKey: ['bills', ctx.businessId], queryFn: () => load({ data: { businessId: ctx.businessId } }) });
  const input = useRef<HTMLInputElement>(null); const [open, setOpen] = useState<BillRow | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');

  async function upload(files: FileList | null) {
    const file = files?.[0]; if (input.current) input.current.value = ''; if (!file) return;
    const problem = checkBillFile(file); if (problem) { setMessage(problem); return; }
    setBusy(true); setMessage('');
    const path = billPath(ctx.businessId, file.type as BillType);
    try {
      const up = await supabase.storage.from('bills').upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw new Error('Upload was not allowed. Your role may not permit uploads.');
      try { await register({ data: { businessId: ctx.businessId, path, caption: file.name.replace(/\.[^.]+$/, '').slice(0, 200), billDate: todayAd(), mimeType: file.type as BillType, size: file.size } }); }
      catch (e) { await supabase.storage.from('bills').remove([path]); throw e; }
      setMessage('Bill uploaded.'); await client.invalidateQueries({ queryKey: ['bills', ctx.businessId] });
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Upload failed.'); } finally { setBusy(false); }
  }

  return <>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="sr-only" aria-label="Bill file" onChange={e => upload(e.target.files)} />
    {ctx.canWrite && <Button className="mt-5 h-12 w-full" disabled={busy} onClick={() => input.current?.click()}><Camera />{busy ? 'Uploading…' : 'Add bill photo or PDF'}</Button>}
    {message && <p role="status" className="mt-3 border-l-2 border-primary pl-3 text-sm">{message}</p>}
    {bills.error ? <div className="py-8"><p role="alert" className="text-sm text-destructive">{bills.error.message}</p><Button className="mt-4" variant="outline" onClick={() => bills.refetch()}>Try again</Button></div>
      : bills.isPending ? <p role="status" className="py-8 text-sm">Loading bills…</p>
      : <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{bills.data.bills.map(b => <li key={b.id}><button type="button" className="block w-full overflow-hidden rounded-2xl border bg-card text-left hover:bg-secondary/40" onClick={() => setOpen(b)}>
          <span className="flex h-32 items-center justify-center bg-secondary/40">{b.url && b.mime_type !== 'application/pdf' ? <img src={b.url} alt={b.caption || 'Bill'} loading="lazy" className="size-full object-cover" /> : <FileText className="size-8 text-muted-foreground" />}</span>
          <span className="block p-3"><span className="block truncate text-sm font-medium">{b.caption || 'Untitled bill'}</span><span className="block text-xs text-muted-foreground">{formatBsAd(b.bill_date)}</span></span></button></li>)}
        {!bills.data.bills.length && <li className="col-span-full rounded-2xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">{ctx.canWrite ? 'No bills yet. Photograph a bill to keep it here.' : 'No bills yet.'}</li>}</ul>}
    {open && <Viewer key={open.id} ctx={ctx} bill={open} mine={open.created_by === bills.data?.userId} onClose={() => setOpen(null)} />}
  </>;
}

export function BillGallery() {
  return <WorkspacePage title="Bill Gallery">{ctx => <Body ctx={ctx} />}</WorkspacePage>;
}
