import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WorkspacePage, type WorkspaceContext } from './workspace-page';
import { listItemCategories, renameItemCategory } from '@/lib/workspace.functions';

type Cat = { name: string; count: number };

function RenameDialog({ ctx, cat, names, onClose }: { ctx: WorkspaceContext; cat: Cat; names: string[]; onClose: () => void }) {
  const client = useQueryClient(); const rename = useServerFn(renameItemCategory);
  const [to, setTo] = useState(cat.name); const [error, setError] = useState('');
  const target = to.trim(); const merges = !!target && target !== cat.name && names.includes(target);
  const mutation = useMutation({
    mutationFn: () => rename({ data: { businessId: ctx.businessId, from: cat.name, to: target } }),
    onSuccess: async () => { await client.invalidateQueries(); onClose(); },
    onError: e => setError(e instanceof Error ? e.message : 'Category could not be changed.'),
  });
  return <Dialog open onOpenChange={o => { if (!o && !mutation.isPending) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>{cat.name || 'Uncategorised'}</DialogTitle><DialogDescription>{cat.count} {cat.count === 1 ? 'item' : 'items'} use this category. Leave the name empty to remove the category.</DialogDescription></DialogHeader>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); setError(''); mutation.mutate(); }}>
        <label className="block text-sm">New name<Input aria-label="New category name" className="mt-1 h-11" maxLength={100} value={to} onChange={e => setTo(e.target.value)} /></label>
        {merges && <p className="text-sm text-amber-700">“{target}” already exists, so these items will be merged into it.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="h-11 w-full" disabled={mutation.isPending || target === cat.name}>{mutation.isPending ? 'Saving…' : merges ? 'Merge categories' : 'Save'}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}

function Body({ ctx }: { ctx: WorkspaceContext }) {
  const load = useServerFn(listItemCategories);
  const cats = useQuery({ queryKey: ['item-categories', ctx.businessId], queryFn: () => load({ data: { businessId: ctx.businessId } }) });
  const [open, setOpen] = useState<Cat | null>(null);
  const rows = cats.data?.categories ?? []; const names = rows.map(r => r.name);
  return <>
    <p className="mt-3 text-sm text-muted-foreground">Categories come from your items. Rename one to fix it everywhere, or rename it to another existing category to merge them.{!ctx.canAdmin && ' Only administrators can change categories.'}</p>
    {cats.error ? <div className="py-8"><p role="alert" className="text-sm text-destructive">{cats.error.message}</p><Button className="mt-4" variant="outline" onClick={() => cats.refetch()}>Try again</Button></div>
      : cats.isPending ? <p role="status" className="py-8 text-sm">Loading categories…</p>
      : <ul className="mt-4 divide-y rounded-2xl border bg-card">{rows.map(c => <li key={c.name} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3"><span className="min-w-0"><span className="block break-words font-medium">{c.name || 'Uncategorised'}</span><span className="block text-xs text-muted-foreground">{c.count} {c.count === 1 ? 'item' : 'items'}</span></span>{ctx.canAdmin && <Button variant="outline" size="sm" aria-label={`Rename ${c.name || 'uncategorised'}`} onClick={() => setOpen(c)}><Pencil />Edit</Button>}</li>)}
        {!rows.length && <li className="px-4 py-12 text-center text-sm text-muted-foreground">No items yet, so no categories.</li>}</ul>}
    {open && <RenameDialog key={open.name} ctx={ctx} cat={open} names={names} onClose={() => setOpen(null)} />}
  </>;
}

export function ItemCategories() {
  return <WorkspacePage title="Item Categories">{ctx => <Body ctx={ctx} />}</WorkspacePage>;
}
