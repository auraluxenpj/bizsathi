import { createFileRoute } from '@tanstack/react-router';
import { Parties } from '@/components/parties';
import { businessQuery } from '@/lib/inventory-queries';
import { pageHead } from '@/lib/head';

export const Route = createFileRoute('/_authenticated/parties')({
  validateSearch: (s: Record<string, unknown>): { party?: string; tab?: 'receive' | 'give' } => ({
    ...(typeof s['party'] === 'string' && s['party'] ? { party: s['party'] } : {}),
    ...(s['tab'] === 'receive' || s['tab'] === 'give' ? { tab: s['tab'] } : {}),
  }),
  head: () => pageHead('Parties', 'Customer and supplier balances, ledgers and payments for BizSathi Nepal.'),
  loader: ({ context }) => context.queryClient.ensureQueryData(businessQuery),
  component: Parties,
});
