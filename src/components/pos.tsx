import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Button } from './ui/button';
import { useCommerce } from './commerce-workspace';
import { DocumentEditor } from './document-editor';

// Standalone point of sale: its own full-screen page (no sidebar), selling through the same
// stock-checked sale editor and server confirmation as the Sales screen.
export function Pos() {
  const w = useCommerce();
  const [saved, setSaved] = useState('');
  const name = w.commerce.data?.business.name ?? '';
  const ready = !!w.commerce.data && !!w.access.data && !!w.inventory.data;
  const error = w.commerce.error?.message || w.access.error?.message || w.inventory.error?.message;
  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-card px-4 py-3">
      <Button asChild variant="ghost" size="sm"><Link to="/dashboard"><ArrowLeft />Dashboard</Link></Button>
      <h1 className="truncate text-base font-semibold">{name ? `${name} · ` : ''}Point of sale</h1>
      <Button asChild variant="outline" size="sm"><Link to="/sales">Sales</Link></Button>
    </header>
    <main className="mx-auto max-w-[1600px] px-4 md:px-6">
      {!w.businessId ? <section className="py-16 text-center"><Building2 className="mx-auto mb-4 size-9 text-primary" /><h2 className="text-xl font-semibold">No business linked yet</h2><Button asChild className="mt-5"><Link to="/businesses">Business setup</Link></Button></section>
        : error ? <div className="py-8"><p role="alert" className="text-sm text-destructive">{error}</p><Button className="mt-4" variant="outline" onClick={() => { w.commerce.refetch(); w.access.refetch(); w.inventory.refetch(); }}>Try again</Button></div>
        : !ready ? <p role="status" className="py-8 text-sm">Loading point of sale…</p>
        : saved ? <section className="py-10"><h2 className="text-xl font-semibold">Sale saved</h2><p className="mt-3 break-all text-sm text-muted-foreground">{saved}</p><div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => setSaved('')}>New sale</Button><Button asChild variant="outline"><Link to="/sales">Sales & receipts</Link></Button></div></section>
        : <DocumentEditor key={w.businessId} w={w} kind="sale" standalone onSaved={setSaved} />}
    </main>
  </div>;
}
