import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VoucherWorkspace } from '@/components/voucher-workspace';
import { authorizedSelection } from '@/lib/dashboard-data';
import { businessQuery } from '@/lib/inventory-queries';
import { pageHead } from '@/lib/head';

// Presentation-only wrapper: the existing expense voucher workspace (same RPC posting, same checks).
function Expenses() {
  const { data: businesses } = useSuspenseQuery(businessQuery);
  const [selected, setSelected] = useState('');
  const businessId = authorizedSelection(businesses, selected);
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-9">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <h1 className="brand text-2xl font-semibold">Expenses</h1>
        <label className="w-full text-sm sm:w-64">Business
          <select aria-label="Expenses business" className="mt-1 h-11 w-full rounded-md border bg-card px-3" value={businessId} disabled={!businesses.length} onChange={e => setSelected(e.target.value)}>
            <option value="">No business selected</option>
            {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      </header>
      {businessId
        ? <VoucherWorkspace key={businessId} businessId={businessId} />
        : <section className="py-16 text-center"><Building2 className="mx-auto mb-4 size-9 text-primary" /><h2 className="brand text-xl">No business linked yet</h2><Button asChild className="mt-5"><Link to="/businesses">Business setup</Link></Button></section>}
    </main>
  );
}

export const Route = createFileRoute('/_authenticated/expenses')({
  head: () => pageHead('Expenses', 'Record BizSathi Nepal business expenses through the controlled voucher workspace.'),
  loader: ({ context }) => context.queryClient.ensureQueryData(businessQuery),
  component: Expenses,
});
