import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Pin, PinOff, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WorkspacePage, type WorkspaceContext } from './workspace-page';
import { deleteNote, listNotes, saveNote } from '@/lib/workspace.functions';
import type { NoteRow } from '@/lib/workspace-schemas';
import { formatBsAd } from '@/lib/format';

type Draft = { id?: string; title: string; body: string; pinned: boolean };
const blank: Draft = { title: '', body: '', pinned: false };
const dayOf = (iso: string) => formatBsAd(new Date(iso).toLocaleDateString('en-CA'));

function Editor({ ctx, draft, mine, onClose }: { ctx: WorkspaceContext; draft: Draft; mine: boolean; onClose: () => void }) {
  const client = useQueryClient(); const save = useServerFn(saveNote); const remove = useServerFn(deleteNote);
  const [value, setValue] = useState(draft); const [error, setError] = useState('');
  const editable = ctx.canWrite && (!draft.id || mine || ctx.canAdmin);
  const done = () => { client.invalidateQueries({ queryKey: ['notes', ctx.businessId] }); onClose(); };
  const saving = useMutation({ mutationFn: () => save({ data: { businessId: ctx.businessId, ...(value.id ? { id: value.id } : {}), title: value.title, body: value.body, pinned: value.pinned } }), onSuccess: done, onError: e => setError(e instanceof Error ? e.message : 'Note could not be saved.') });
  const deleting = useMutation({ mutationFn: () => remove({ data: { businessId: ctx.businessId, id: draft.id! } }), onSuccess: done, onError: e => setError(e instanceof Error ? e.message : 'Note could not be deleted.') });
  return <Dialog open onOpenChange={o => { if (!o && !saving.isPending) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>{draft.id ? (editable ? 'Edit note' : 'Note') : 'New note'}</DialogTitle><DialogDescription>Notes are shared with everyone in the business.</DialogDescription></DialogHeader>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); setError(''); saving.mutate(); }}>
        <label className="block text-sm">Title<Input aria-label="Note title" className="mt-1 h-11" required maxLength={160} disabled={!editable} value={value.title} onChange={e => setValue({ ...value, title: e.target.value })} /></label>
        <label className="block text-sm">Note<Textarea aria-label="Note text" className="mt-1 min-h-40" maxLength={20000} disabled={!editable} value={value.body} onChange={e => setValue({ ...value, body: e.target.value })} /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {editable && <div className="flex flex-wrap gap-2">
          <Button type="submit" className="h-11 flex-1" disabled={saving.isPending || !value.title.trim()}>{saving.isPending ? 'Saving…' : 'Save'}</Button>
          <Button type="button" variant="outline" className="h-11" aria-pressed={value.pinned} onClick={() => setValue({ ...value, pinned: !value.pinned })}>{value.pinned ? <PinOff /> : <Pin />}{value.pinned ? 'Unpin' : 'Pin'}</Button>
          {draft.id && <Button type="button" variant="outline" className="h-11 text-destructive" disabled={deleting.isPending} onClick={() => { if (window.confirm('Delete this note?')) deleting.mutate(); }}><Trash2 />Delete</Button>}
        </div>}
      </form>
    </DialogContent>
  </Dialog>;
}

function Body({ ctx }: { ctx: WorkspaceContext }) {
  const load = useServerFn(listNotes);
  const notes = useQuery({ queryKey: ['notes', ctx.businessId], queryFn: () => load({ data: { businessId: ctx.businessId } }) });
  const [text, setText] = useState(''); const [open, setOpen] = useState<{ draft: Draft; mine: boolean } | null>(null);
  const q = text.trim().toLowerCase();
  const rows = (notes.data?.notes ?? []).filter(n => !q || `${n.title} ${n.body}`.toLowerCase().includes(q));
  const edit = (n: NoteRow) => setOpen({ draft: { id: n.id, title: n.title, body: n.body, pinned: n.pinned }, mine: n.created_by === notes.data?.userId });
  return <>
    <div className="mt-5 flex items-center gap-2 rounded-lg border bg-card px-3"><Search className="size-4 text-muted-foreground" /><Input aria-label="Search notes" className="h-11 border-0 px-0 shadow-none focus-visible:ring-0" placeholder="Search notes" value={text} onChange={e => setText(e.target.value)} /></div>
    {notes.error ? <div className="py-8"><p role="alert" className="text-sm text-destructive">{notes.error.message}</p><Button className="mt-4" variant="outline" onClick={() => notes.refetch()}>Try again</Button></div>
      : notes.isPending ? <p role="status" className="py-8 text-sm">Loading notes…</p>
      : <ul className="mt-4 space-y-3">{rows.map(n => <li key={n.id}><button type="button" className="block w-full rounded-2xl border bg-card p-4 text-left hover:bg-secondary/40" onClick={() => edit(n)}>
          <span className="flex items-start justify-between gap-3"><span className="min-w-0 break-words font-medium">{n.title}</span>{n.pinned && <Pin className="size-4 shrink-0 text-primary" aria-label="Pinned" />}</span>
          {n.body && <span className="mt-1 line-clamp-2 block whitespace-pre-line break-words text-sm text-muted-foreground">{n.body}</span>}
          <span className="mt-2 block text-xs text-muted-foreground">{dayOf(n.updated_at)}</span></button></li>)}
        {!rows.length && <li className="rounded-2xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">{notes.data?.notes.length ? 'No notes match.' : ctx.canWrite ? 'No notes yet. Tap New note to write one.' : 'No notes yet.'}</li>}</ul>}
    {open && <Editor key={open.draft.id ?? 'new'} ctx={ctx} draft={open.draft} mine={open.mine} onClose={() => setOpen(null)} />}
    {ctx.canWrite && <Button className="fixed bottom-20 right-4 z-20 h-12 rounded-full px-5 shadow-lg lg:bottom-6" onClick={() => setOpen({ draft: blank, mine: true })}><Plus />New note</Button>}
  </>;
}

export function Notebook() {
  return <WorkspacePage title="Notebook">{ctx => <Body ctx={ctx} />}</WorkspacePage>;
}
