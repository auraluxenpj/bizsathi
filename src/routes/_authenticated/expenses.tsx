import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VoucherWorkspace } from '@/components/voucher-workspace';
import { businessQuery } from '@/lib/inventory-queries';
import { pageHead } from '@/lib/head';

// Presentation-only wrapper: the existing expense voucher workspace (same RPC posting, same checks).
function Expenses() {
  const { data: businesses } = useSuspenseQuery(businessQuery);
  const businessId = businesses[0]?.id ?? '';
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-9">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <h1 className="brand text-2xl font-semibold">Expenses</h1>
      </header>
      {businessId
        ? <VoucherWorkspace key={businessId} businessId={businessId} />
        : <section className="py-16 text-center"><Building2 className="mx-auto mb-4 size-9 text-primary" /><h2 className="brand text-xl">AURALUXE workspace access required</h2><p className="mt-2 text-sm text-muted-foreground">Ask an AURALUXE administrator for a staff invitation.</p></section>}
    </main>
  );
}

export const Route = createFileRoute('/_authenticated/expenses')({
  head: () => pageHead('Expenses', 'Record BizSathi Nepal business expenses through the controlled voucher workspace.'),
  loader: ({ context }) => context.queryClient.ensureQueryData(businessQuery),
  component: Expenses,
});
