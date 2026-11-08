import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Camera, CheckCircle2, FileText, Sparkles, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DualDateInput } from './dual-date-input';
import { PeriodNotice } from './period-notice';
import { WorkspacePage, type WorkspaceContext } from './workspace-page';
import { supabase } from '@/integrations/supabase/client';
import { getVoucherWorkspace } from '@/lib/vouchers.functions';
import { confirmReceipt, listReceipts, rejectReceipt, scanReceipt } from '@/lib/receipts.functions';
import { buildExpenseRequest, checkReceiptFile, emptyExtraction, findDuplicate, normalizeExtraction, normalizeMoney, paymentMethods, receiptCategories, receiptPath, type Extraction, type ReceiptType } from '@/lib/receipt-schemas';
import { formatBsAd, formatNPR, todayAd } from '@/lib/format';

type Status = 'needs_review' | 'posted' | 'rejected';
type Receipt = { id: string; file_name: string; mime_type: string; status: string; ai_extraction: unknown; ai_error: string | null; reviewed: unknown; review_note: string | null; created_at: string; url: string | null };
const tabs: { id: Status; label: string }[] = [{ id: 'needs_review', label: 'Needs review' }, { id: 'posted', label: 'Posted' }, { id: 'rejected', label: 'Rejected' }];
const requestKey = (receiptId: string) => `bizsathi-receipt-request:${receiptId}`;
// One request id per receipt, kept for the session, so pressing Confirm twice can never post twice.
function requestId(receiptId: string): string {
  try { const saved = sessionStorage.getItem(requestKey(receiptId)); if (saved) return saved; const fresh = crypto.randomUUID(); sessionStorage.setItem(requestKey(receiptId), fresh); return fresh; } catch { return crypto.randomUUID(); }
}
const postedAmount = (reviewed: unknown) => (reviewed as { lines?: { debit?: string }[] } | null)?.lines?.find(l => Number(l.debit) > 0)?.debit;

function ReviewDialog({ ctx, receipt, posted, onClose }: { ctx: WorkspaceContext; receipt: Receipt; posted: Receipt[]; onClose: () => void }) {
  const client = useQueryClient(); const loadWorkspace = useServerFn(getVoucherWorkspace); const confirm = useServerFn(confirmReceipt); const reject = useServerFn(rejectReceipt);
  const ws = useQuery({ queryKey: ['voucher-workspace', ctx.businessId], queryFn: () => loadWorkspace({ data: { businessId: ctx.businessId } }) });
  const ai: Extraction = useMemo(() => normalizeExtraction(receipt.ai_extraction ?? emptyExtraction), [receipt.ai_extraction]);
  const open = receipt.status === 'needs_review';
  const [f, setF] = useState({ supplier: ai.supplier ?? '', invoiceNumber: ai.invoiceNumber ?? '', date: ai.date ?? todayAd(), amount: ai.total ?? '', category: ai.category ?? 'expense_operating', method: 'bank' as 'bank' | 'wallet', note: '', branchId: '' });
  const [rejecting, setRejecting] = useState(false); const [reason, setReason] = useState(''); const [error, setError] = useState('');
  const branches = ws.data?.branches ?? []; const branchId = f.branchId || (branches.length === 1 ? branches[0]!.id : '');
  const period = ws.data?.periods.find(p => f.date >= p.start_date && f.date <= p.end_date);
  const amountOk = !!normalizeMoney(f.amount) && /^\d+(\.\d{1,2})?$/.test(f.amount);
  const duplicate = open && findDuplicate(f.invoiceNumber, f.amount, posted);
  const done = () => { client.invalidateQueries({ queryKey: ['receipts', ctx.businessId] }); client.invalidateQueries({ queryKey: ['voucher-workspace', ctx.businessId] }); onClose(); };
  const post = useMutation({
    mutationFn: () => confirm({ data: { businessId: ctx.businessId, receiptId: receipt.id, request: buildExpenseRequest({ id: requestId(receipt.id), businessId: ctx.businessId, branchId, periodId: period!.id, date: f.date, supplier: f.supplier, invoiceNumber: f.invoiceNumber, amount: f.amount, category: f.category, method: f.method, note: f.note, receiptId: receipt.id }) } }),
    onSuccess: done, onError: e => setError(e instanceof Error ? e.message : 'Could not post this expense.'),
  });
  const rejectIt = useMutation({ mutationFn: () => reject({ data: { businessId: ctx.businessId, receiptId: receipt.id, note: reason } }), onSuccess: done, onError: e => setError(e instanceof Error ? e.message : 'Could not reject this receipt.') });
  const canPost = open && amountOk && !!branchId && !!period && !!f.supplier.trim() && !post.isPending;

  return <Dialog open onOpenChange={o => { if (!o && !post.isPending) onClose(); }}>
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle className="break-all">{receipt.file_name}</DialogTitle><DialogDescription>{open ? 'Check every detail. Nothing is posted until you confirm.' : receipt.status === 'posted' ? 'Posted as an expense.' : 'Rejected.'}</DialogDescription></DialogHeader>
      {receipt.url && (receipt.mime_type === 'application/pdf' ? <Button asChild variant="outline"><a href={receipt.url} target="_blank" rel="noreferrer"><FileText />Open PDF</a></Button> : <a href={receipt.url} target="_blank" rel="noreferrer"><img src={receipt.url} alt="Receipt" className="max-h-64 w-full rounded-lg border object-contain" /></a>)}
      {open && receipt.ai_error && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{receipt.ai_error}</p>}
      {open && !receipt.ai_error && <p className="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-sm"><Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />Filled in by AI. It can be wrong, so please check each field.{ai.categoryReason && <span className="text-muted-foreground"> Category: {ai.categoryReason}</span>}</p>}
      {!open && <dl className="space-y-1 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">Amount</dt><dd>{postedAmount(receipt.reviewed) ? formatNPR(Number(postedAmount(receipt.reviewed))) : '—'}</dd></div>{receipt.review_note && <div><dt className="text-muted-foreground">Reason for rejecting</dt><dd className="break-words">{receipt.review_note}</dd></div>}</dl>}
      {open && !rejecting && <form className="space-y-3" onSubmit={e => { e.preventDefault(); setError(''); post.mutate(); }}>
        <label className="block text-sm">Supplier<Input aria-label="Supplier" className="mt-1 h-11" maxLength={160} value={f.supplier} onChange={e => setF({ ...f, supplier: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Invoice no.<Input aria-label="Invoice number" className="mt-1 h-11" maxLength={80} value={f.invoiceNumber} onChange={e => setF({ ...f, invoiceNumber: e.target.value })} /></label>
          <label className="block text-sm">Amount (NPR)<Input aria-label="Amount" className="mt-1 h-11" inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></label>
        </div>
        {f.amount && !amountOk && <p className="text-xs text-destructive">Enter a number with at most two decimals.</p>}
        <DualDateInput value={f.date} onChange={d => setF({ ...f, date: d })} label="Bill date" />
        <label className="block text-sm">Category<select aria-label="Category" className="mt-1 h-11 w-full rounded-md border bg-card px-3" value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{receiptCategories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Paid from<select aria-label="Paid from" className="mt-1 h-11 w-full rounded-md border bg-card px-3" value={f.method} onChange={e => setF({ ...f, method: e.target.value as 'bank' | 'wallet' })}>{paymentMethods.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
          {branches.length > 1 ? <label className="block text-sm">Branch<select aria-label="Branch" className="mt-1 h-11 w-full rounded-md border bg-card px-3" value={branchId} onChange={e => setF({ ...f, branchId: e.target.value })}><option value="">Choose…</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label> : <p className="self-end pb-3 text-xs text-muted-foreground">{branches[0]?.name ?? ''}</p>}
        </div>
        <label className="block text-sm">Note (optional)<Input aria-label="Note" className="mt-1 h-11" maxLength={300} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></label>
        <p className="text-xs text-muted-foreground">Cash payments are not supported here. Record those on the Expenses screen.</p>
        {ws.data && !period && <PeriodNotice businessId={ctx.businessId} date={f.date} />}
        {duplicate && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">An expense with this invoice number and amount was already posted. Check it is not a duplicate.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2"><Button type="submit" className="h-11 flex-1" disabled={!canPost}><CheckCircle2 />{post.isPending ? 'Posting…' : 'Confirm and post'}</Button><Button type="button" variant="outline" className="h-11 text-destructive" onClick={() => setRejecting(true)}><XCircle />Reject</Button></div>
      </form>}
      {open && rejecting && <form className="space-y-3" onSubmit={e => { e.preventDefault(); setError(''); rejectIt.mutate(); }}>
        <label className="block text-sm">Why is this being rejected?<Textarea aria-label="Reason" className="mt-1" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2"><Button type="submit" variant="destructive" className="h-11 flex-1" disabled={!reason.trim() || rejectIt.isPending}>{rejectIt.isPending ? 'Rejecting…' : 'Reject receipt'}</Button><Button type="button" variant="outline" className="h-11" onClick={() => setRejecting(false)}>Back</Button></div>
      </form>}
    </DialogContent>
  </Dialog>;
}

function Body({ ctx }: { ctx: WorkspaceContext }) {
  const client = useQueryClient(); const load = useServerFn(listReceipts); const scan = useServerFn(scanReceipt);
  const input = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Status>('needs_review'); const [open, setOpen] = useState<Receipt | null>(null);
  const [queue, setQueue] = useState<{ name: string; state: 'uploading' | 'reading' | 'done' | 'failed'; note?: string }[]>([]);
  const receipts = useQuery({ queryKey: ['receipts', ctx.businessId], queryFn: () => load({ data: { businessId: ctx.businessId } }), enabled: ctx.canAccount });

  async function upload(files: FileList | null) {
    const list = Array.from(files ?? []); if (input.current) input.current.value = ''; if (!list.length) return;
    setQueue(list.map(f => ({ name: f.name, state: 'uploading' })));
    const set = (i: number, patch: Partial<(typeof queue)[number]>) => setQueue(q => q.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    for (const [i, file] of list.entries()) {
      const problem = checkReceiptFile(file); if (problem) { set(i, { state: 'failed', note: problem }); continue; }
      const path = receiptPath(ctx.businessId, file.type as ReceiptType);
      const up = await supabase.storage.from('expense-receipts').upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) { set(i, { state: 'failed', note: 'Upload was not allowed. Only accountants and administrators can scan receipts.' }); continue; }
      set(i, { state: 'reading' });
      try { const r = await scan({ data: { businessId: ctx.businessId, path, fileName: file.name, mimeType: file.type as ReceiptType } }); set(i, { state: 'done', ...(r.aiError ? { note: r.aiError } : {}) }); }
      catch (e) { await supabase.storage.from('expense-receipts').remove([path]); set(i, { state: 'failed', note: e instanceof Error ? e.message : 'Could not read this file.' }); }
    }
    await client.invalidateQueries({ queryKey: ['receipts', ctx.businessId] });
  }

  if (!ctx.canAccount) return <p className="mt-6 text-sm text-muted-foreground">Only accountants and administrators can scan and review receipts.</p>;
  const all = receipts.data?.receipts ?? []; const shown = all.filter(r => r.status === tab); const posted = all.filter(r => r.status === 'posted');
  const count = (s: Status) => all.filter(r => r.status === s).length;
  return <>
    <input ref={input} type="file" multiple accept="image/jpeg,image/png,application/pdf" capture="environment" className="sr-only" aria-label="Receipt files" onChange={e => upload(e.target.files)} />
    <Button className="mt-5 h-12 w-full" onClick={() => input.current?.click()}><Camera />Scan receipts</Button>
    <p className="mt-2 text-xs text-muted-foreground">Photos (JPG, PNG) or PDFs up to 8 MB. AI suggests the details; you check and post each one.</p>
    {queue.length > 0 && <ul className="mt-3 space-y-1 text-sm" aria-label="Upload progress">{queue.map((q, i) => <li key={i} className="flex justify-between gap-3"><span className="min-w-0 truncate">{q.name}</span><span className={`shrink-0 ${q.state === 'failed' ? 'text-destructive' : q.state === 'done' ? 'text-emerald-600' : 'text-muted-foreground'}`}>{q.state === 'uploading' ? 'Uploading…' : q.state === 'reading' ? 'Reading…' : q.state === 'done' ? (q.note ? 'Added, fill in manually' : 'Ready to review') : (q.note ?? 'Failed')}</span></li>)}</ul>}
    <div className="mt-5 flex rounded-lg border p-0.5 text-sm" role="group" aria-label="Status">{tabs.map(t => <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)} className={`flex-1 rounded-md px-2 py-1.5 ${tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{t.label} ({count(t.id)})</button>)}</div>
    {receipts.error ? <div className="py-8"><p role="alert" className="text-sm text-destructive">{receipts.error.message}</p><Button className="mt-4" variant="outline" onClick={() => receipts.refetch()}>Try again</Button></div>
      : receipts.isPending ? <p role="status" className="py-8 text-sm">Loading receipts…</p>
      : <ul className="mt-3 divide-y rounded-2xl border bg-card">{shown.map(r => { const e = normalizeExtraction(r.ai_extraction ?? emptyExtraction); const amount = postedAmount(r.reviewed) ?? e.total;
          return <li key={r.id}><button type="button" className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/40" onClick={() => setOpen(r)}>
            <span className="min-w-0"><span className="block break-words font-medium">{e.supplier ?? r.file_name}</span><span className="block text-xs text-muted-foreground">{formatBsAd(e.date ?? r.created_at.slice(0, 10))}{r.ai_error ? ' · needs manual entry' : ''}</span></span>
            <span className="shrink-0 text-sm tabular-nums">{amount ? formatNPR(Number(amount)) : '—'}</span></button></li>; })}
        {!shown.length && <li className="px-4 py-12 text-center text-sm text-muted-foreground">{tab === 'needs_review' ? 'Nothing to review. Tap Scan receipts to add some.' : 'Nothing here yet.'}</li>}</ul>}
    {open && <ReviewDialog key={open.id} ctx={ctx} receipt={open} posted={posted} onClose={() => setOpen(null)} />}
  </>;
}

export function ExpenseReceipts() {
  return <WorkspacePage title="Scan Receipts">{ctx => <Body ctx={ctx} />}</WorkspacePage>;
}
