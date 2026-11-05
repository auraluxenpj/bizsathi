import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { Button } from './ui/button';
import { getInventory } from '@/lib/inventory.functions';
import { stockBalances } from '@/lib/inventory-schemas';

type Branch = { id: string; name: string };

// Same query and same low-stock rule as before; extracted so the dashboard can also show the count.
export function useLowStock(businessId: string, branches: Branch[], branchId: string) {
  const load = useServerFn(getInventory);
  const inventory = useQuery({ queryKey: ['inventory', businessId], queryFn: () => load({ data: { businessId } }), enabled: !!businessId });
  const totals = stockBalances(inventory.data?.movements ?? []);
  const rows = branches.filter(b => !branchId || branchId === b.id).flatMap(b => (inventory.data?.variants ?? []).filter(v => v.is_active && v.products?.is_active).map(v => ({ branch: b, variant: v, quantity: totals.get(`${b.id}:${v.id}`) ?? 0 }))).filter(r => r.quantity <= Number(r.variant.reorder_level));
  return { inventory, rows };
}

export function LowStockSummary({ businessId, branches, branchId }: { businessId: string; branches: Branch[]; branchId: string }) {
  const { inventory, rows } = useLowStock(businessId, branches, branchId);
  return <div className="mt-3">{inventory.error ? <p role="alert" className="text-sm text-destructive">{inventory.error.message}</p> : businessId && inventory.isPending ? <p className="py-6 text-sm text-muted-foreground">Loading inventory…</p> : rows.length ? <ul className="divide-y">{rows.slice(0, 5).map(r => <li key={`${r.branch.id}:${r.variant.id}`} className="flex justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="break-words">{r.variant.products?.name} · {r.variant.sku}</p><p className="text-xs text-muted-foreground">{r.branch.name}</p></div><p className="shrink-0 font-medium text-destructive">{r.quantity} {r.variant.unit}</p></li>)}</ul> : <p className="py-6 text-center text-sm text-muted-foreground">{!businessId ? 'No business selected.' : !branches.length ? 'No authorized branches.' : 'No low-stock products.'}</p>}<Button asChild variant="ghost" size="sm"><Link to="/inventory">Stock ledger</Link></Button></div>;
}
