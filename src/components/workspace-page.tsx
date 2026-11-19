import type { ReactNode } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { businessQuery } from '@/lib/inventory-queries';

export type WorkspaceContext = { businessId: string; role: string; canWrite: boolean; canAdmin: boolean; canAccount: boolean };

// Page frame for the single-business tools (notebook, bill gallery, categories). The role only decides which
// buttons to show; the database row-level security is what actually enforces who may do what.
export function WorkspacePage({ title, right, children }: { title: string; right?: (c: WorkspaceContext) => ReactNode; children: (c: WorkspaceContext) => ReactNode }) {
  const { data: businesses } = useSuspenseQuery(businessQuery);
  const businessId = businesses[0]?.id ?? '';
  const role = businesses.find(b => b.id === businessId)?.role ?? 'viewer';
  const ctx: WorkspaceContext = { businessId, role, canWrite: ['owner', 'admin', 'accountant', 'staff'].includes(role), canAdmin: role === 'owner' || role === 'admin', canAccount: ['owner', 'admin', 'accountant'].includes(role) };
  return <main className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-7">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{title}</h1>{businessId && right?.(ctx)}</header>
    {businessId ? children(ctx) : <section className="py-16 text-center"><h2 className="text-xl font-semibold">AURALUXE workspace access required</h2><p className="mt-2 text-sm text-muted-foreground">Ask an AURALUXE administrator for a staff invitation.</p></section>}
  </main>;
}
