import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CommerceWorkspace } from './commerce-workspace';

export type CommerceData = NonNullable<CommerceWorkspace['commerce']['data']>;
export type InventoryData = NonNullable<CommerceWorkspace['inventory']['data']>;

// Shared page frame for the simple read-only screens: title, loading, error and no-business states.
export function Screen({ title, w, right, children }: { title: string; w: CommerceWorkspace; right?: ReactNode; children: (d: { commerce: CommerceData; inventory: InventoryData }) => ReactNode }) {
  const error = w.commerce.error?.message || w.inventory.error?.message || w.access.error?.message;
  const ready = !!w.commerce.data && !!w.inventory.data;
  return <main className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-7">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{title}</h1>{right}</header>
    {!w.businessId ? <section className="py-16 text-center"><Building2 className="mx-auto mb-4 size-9 text-primary" /><h2 className="text-xl font-semibold">No business linked yet</h2><Button asChild className="mt-5"><Link to="/businesses">Business setup</Link></Button></section>
      : error ? <div className="py-8"><p role="alert" className="text-sm text-destructive">{error}</p><Button className="mt-4" variant="outline" onClick={() => { w.commerce.refetch(); w.inventory.refetch(); }}>Try again</Button></div>
      : !ready ? <p role="status" className="py-8 text-sm">Loading…</p>
      : children({ commerce: w.commerce.data!, inventory: w.inventory.data! })}
  </main>;
}
