import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Plus, Save, Trash2, RefreshCw, CalendarDays, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { loadAuraluxeCollections, saveAuraluxeCollections } from '@/lib/website-collections.functions';
import { AURALUXE_BUSINESS_ID } from '@/lib/website-sync';

type Product = { id: string; name: string; sku: string | null; stock: number; images: string[] | null };
type Collection = {
  id: string; name: string; slug: string; collection_type: 'seasonal' | 'occasion' | 'custom';
  description: string | null; is_active: boolean; sort_order: number;
  starts_at: string | null; ends_at: string | null; product_ids: string[];
};
type Payload = { collections: Collection[]; products: Product[] };

const toDateInput = (value: string | null) => value ? new Date(value).toISOString().slice(0, 10) : '';
const toIso = (value: string) => value ? new Date(value + 'T00:00:00.000Z').toISOString() : null;
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function StorefrontCollectionsWorkspace() {
  const load = useServerFn(loadAuraluxeCollections);
  const save = useServerFn(saveAuraluxeCollections);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['auraluxe-storefront-collections'],
    queryFn: () => load({ data: { businessId: AURALUXE_BUSINESS_ID } }) as Promise<Payload>,
  });
  const [collections, setCollections] = useState<Collection[]>([]);
  useEffect(() => { if (query.data) setCollections(query.data.collections); }, [query.data]);
  const products = query.data?.products ?? [];
  const mutation = useMutation({
    mutationFn: () => save({ data: { businessId: AURALUXE_BUSINESS_ID, collections } }),
    onSuccess: async () => { toast.success('Storefront collections saved'); await client.invalidateQueries({ queryKey: ['auraluxe-storefront-collections'] }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not save collections'),
  });
  const assignedCount = useMemo(() => collections.reduce((n, c) => n + c.product_ids.length, 0), [collections]);

  function update(id: string, patch: Partial<Collection>) {
    setCollections(current => current.map(c => c.id === id ? { ...c, ...patch } : c));
  }
  function addCollection() {
    const id = crypto.randomUUID();
    setCollections(current => [...current, {
      id, name: 'New Collection', slug: 'new-collection-' + id.slice(0, 6),
      collection_type: 'seasonal', description: null, is_active: false,
      sort_order: current.length + 1, starts_at: null, ends_at: null, product_ids: [],
    }]);
  }
  function removeCollection(id: string) {
    setCollections(current => current.filter(c => c.id !== id).map((c, i) => ({ ...c, sort_order: i + 1 })));
  }

  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-5 md:px-8">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">AURALUXE Storefront</p><h1 className="mt-1 text-2xl font-bold">Seasonal & Occasion Collections</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Choose which products appear together on the shop homepage. Only published and in-stock products are shown to customers.</p></div>
      <div className="flex gap-2">
        <button type="button" onClick={() => query.refetch()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm"><RefreshCw className="size-4"/>Refresh</button>
        <button type="button" onClick={addCollection} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm text-primary-foreground"><Plus className="size-4"/>Add collection</button>
      </div>
    </header>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">Collections</p><p className="text-2xl font-semibold">{collections.length}</p></div>
      <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">Available products</p><p className="text-2xl font-semibold">{products.length}</p></div>
      <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">Product assignments</p><p className="text-2xl font-semibold">{assignedCount}</p></div>
    </div>
    {query.isLoading ? <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Loading AURALUXE collections…</div> : null}
    {query.isError ? <div className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{query.error instanceof Error ? query.error.message : 'Could not load collections'}</div> : null}
    {!query.isLoading && collections.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center"><Layers className="mx-auto size-8 text-muted-foreground"/><p className="mt-2 font-medium">No collections created yet</p><p className="mt-1 text-sm text-muted-foreground">Start with Winter Collection, Wedding & Party Wear, or Everyday Fashion.</p></div> : null}
    <div className="space-y-4">
      {collections.map((c, index) => <section key={c.id} className="space-y-4 rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{index + 1}</span><h2 className="font-semibold">{c.name || 'Untitled collection'}</h2></div><button type="button" onClick={() => removeCollection(c.id)} className="inline-flex size-9 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10" aria-label="Delete collection"><Trash2 className="size-4"/></button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span className="font-medium">Collection name</span><input value={c.name} onChange={e => update(c.id,{name:e.target.value,slug:slugify(e.target.value) || c.slug})} className="min-h-10 w-full rounded-lg border bg-background px-3"/></label>
          <label className="space-y-1 text-sm"><span className="font-medium">Type</span><select value={c.collection_type} onChange={e => update(c.id,{collection_type:e.target.value as Collection['collection_type']})} className="min-h-10 w-full rounded-lg border bg-background px-3"><option value="seasonal">Seasonal</option><option value="occasion">Occasion</option><option value="custom">Custom</option></select></label>
          <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium">Description (optional)</span><input value={c.description ?? ''} onChange={e => update(c.id,{description:e.target.value || null})} maxLength={500} className="min-h-10 w-full rounded-lg border bg-background px-3"/></label>
          <label className="space-y-1 text-sm"><span className="font-medium">Start date</span><span className="flex min-h-10 items-center gap-2 rounded-lg border px-3"><CalendarDays className="size-4 text-muted-foreground"/><input type="date" value={toDateInput(c.starts_at)} onChange={e => update(c.id,{starts_at:toIso(e.target.value)})} className="min-w-0 flex-1 bg-transparent"/></span></label>
          <label className="space-y-1 text-sm"><span className="font-medium">End date</span><span className="flex min-h-10 items-center gap-2 rounded-lg border px-3"><CalendarDays className="size-4 text-muted-foreground"/><input type="date" value={toDateInput(c.ends_at)} onChange={e => update(c.id,{ends_at:toIso(e.target.value)})} className="min-w-0 flex-1 bg-transparent"/></span></label>
          <label className="space-y-1 text-sm"><span className="font-medium">Display order</span><input type="number" min="0" max="10000" value={c.sort_order} onChange={e => update(c.id,{sort_order:Number(e.target.value)})} className="min-h-10 w-full rounded-lg border bg-background px-3"/></label>
          <label className="flex min-h-10 items-center gap-2 self-end rounded-lg border px-3 text-sm"><input type="checkbox" checked={c.is_active} onChange={e => update(c.id,{is_active:e.target.checked})}/>Show on storefront</label>
        </div>
        <div><div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Assign products</h3><span className="text-xs text-muted-foreground">{c.product_ids.length} selected</span></div>
          {products.length ? <div className="grid max-h-64 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">
            {products.map(p => <label key={p.id} className="flex min-w-0 items-center gap-2 text-sm"><input type="checkbox" checked={c.product_ids.includes(p.id)} onChange={e => update(c.id,{product_ids:e.target.checked ? [...c.product_ids,p.id] : c.product_ids.filter(id => id !== p.id)})}/><span className="min-w-0 flex-1 truncate">{p.name}<span className="ml-2 text-xs text-muted-foreground">{p.sku || ''}</span></span><span className="text-xs text-muted-foreground">Stock {p.stock}</span></label>)}
          </div> : <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">No published, in-stock products are available to assign.</p>}
        </div>
      </section>)}
    </div>
    <footer className="sticky bottom-3 flex items-center justify-between gap-3 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur"><p className="text-xs text-muted-foreground">Changes are saved to the AURALUXE storefront configuration.</p><button type="button" disabled={mutation.isPending || query.isLoading || query.isError} onClick={() => mutation.mutate()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Save className="size-4"/>{mutation.isPending ? 'Saving…' : 'Save collections'}</button></footer>
  </main>;
}
