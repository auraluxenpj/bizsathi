import { useState } from 'react';
import './pos-workspace.css';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Building2, LogOut } from 'lucide-react';
import { Button } from './ui/button';
import { useCommerce } from './commerce-workspace';
import { DocumentEditor } from './document-editor';
import { OfflinePos } from './offline-pos';
import { supabase } from '@/integrations/supabase/client';
import { useCan } from './permission-checklist';
import { isBillingStaff } from '@/lib/workspace-navigation';

// Standalone point of sale: its own full-screen page (no sidebar), selling through the same
// stock-checked sale editor and server confirmation as the Sales screen.
export function Pos() {
  const w = useCommerce();
  const navigate = useNavigate();
  const can = useCan(w.businessId ?? '');
  const billingStaff = isBillingStaff(can);
  async function signOut() { await supabase.auth.signOut(); await navigate({ to: '/auth', replace: true }); }
  const [saved, setSaved] = useState('');
  const name = w.commerce.data?.business.name ?? '';
  const ready = !!w.commerce.data && !!w.access.data && !!w.inventory.data;
  const error = w.commerce.error?.message || w.access.error?.message || w.inventory.error?.message;
  return <div className="pos-workspace min-h-screen bg-background">
    <header className="pos-topbar sticky top-0 z-30 grid min-h-[48px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 border-b bg-card/95 px-3 py-1 shadow-sm backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 justify-start">
        {billingStaff ? <span className="truncate text-xs font-semibold text-muted-foreground sm:text-sm">POS-only workspace</span> : <Button asChild variant="ghost" size="sm"><Link to="/dashboard"><ArrowLeft />Dashboard</Link></Button>}
      </div>
      <h1 className="max-w-[48vw] truncate text-center text-sm font-semibold sm:max-w-none sm:text-base">{name ? `${name} · ` : ''}Point of sale</h1>
      <div className="flex min-w-0 justify-end">
        {billingStaff ? <Button variant="outline" size="sm" onClick={signOut}><LogOut className="size-4" /><span className="hidden sm:inline">Sign out</span></Button> : <Button asChild variant="outline" size="sm"><Link to="/sales">Sales</Link></Button>}
      </div>
    </header>
    <main className="pos-main mx-auto w-full max-w-[1800px] px-3 py-4 sm:px-5 md:px-7 lg:px-8">
      {!w.businessId ? <section className="py-16 text-center"><Building2 className="mx-auto mb-4 size-9 text-primary" /><h2 className="text-xl font-semibold">No business linked yet</h2><Button asChild className="mt-5"><Link to="/businesses">Business setup</Link></Button></section>
        : error ? <div className="py-8"><p role="alert" className="text-sm text-destructive">{error}</p><Button className="mt-4" variant="outline" onClick={() => { w.commerce.refetch(); w.access.refetch(); w.inventory.refetch(); }}>Try again</Button></div>
        : !ready ? <p role="status" className="py-8 text-sm">Loading point of sale…</p>
        : saved ? <section className="py-10"><h2 className="text-xl font-semibold">Sale saved</h2><p className="mt-3 break-all text-sm text-muted-foreground">{saved}</p><div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => setSaved('')}>New sale</Button>{!billingStaff && <Button asChild variant="outline"><Link to="/sales">Sales & receipts</Link></Button>}</div></section>
        : <DocumentEditor key={w.businessId} w={w} kind="sale" standalone onSaved={setSaved} />}
      {ready && !error && w.businessId && <OfflinePos w={w} />}
    </main>
  </div>;
}
