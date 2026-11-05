import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { Building2, Receipt, ShoppingBag, Package, UsersRound, Wallet, Banknote, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, TrendingUp, Plus, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBusinessAccess, listBusinesses } from '@/lib/business.functions';
import { authorizedSelection, financialAvailability } from '@/lib/dashboard-data';
import { LowStockSummary, useLowStock } from './low-stock-summary';
import { getCommerce } from '@/lib/commerce.functions';
import { commerceTotals } from '@/lib/commerce-totals';
import { formatBsAd, formatNPR, todayAd } from '@/lib/format';

const selectClass = 'mt-1 h-11 w-full rounded-md border bg-card px-3 text-sm text-foreground';

function StatCard({ label, value, hint, icon: Icon, tone = 'text-primary', to }: { label: string; value: string; hint: string; icon: LucideIcon; tone?: string; to?: string }) {
  const body = <><div className="flex items-center justify-between gap-2"><h2 className="text-xs font-medium text-muted-foreground">{label}</h2><span className={`flex size-8 items-center justify-center rounded-full bg-secondary ${tone}`}><Icon className="size-4" /></span></div><p className="mt-3 break-words text-xl font-semibold tabular-nums sm:text-2xl">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></>;
  const cls = 'min-w-0 rounded-xl border bg-card p-4 shadow-sm';
  return to ? <Link to={to} className={`${cls} block transition-colors hover:bg-secondary/40`}>{body}</Link> : <article className={cls}>{body}</article>;
}

export function Dashboard() {
  const list = useServerFn(listBusinesses); const getAccess = useServerFn(getBusinessAccess);
  const businesses = useQuery({ queryKey: ['businesses'], queryFn: () => list() });
  const [selected, setSelected] = useState(''); const [branch, setBranch] = useState('');
  const businessId = authorizedSelection(businesses.data ?? [], selected);
  const access = useQuery({ queryKey: ['business-access', businessId], queryFn: () => getAccess({ data: { businessId } }), enabled: Boolean(businessId) });
  const branches = access.data?.branches.filter(b => b.is_active) ?? [];
  const branchId = branches.some(b => b.id === branch) ? branch : '';
  const loadCommerce = useServerFn(getCommerce);
  const commerce = useQuery({ queryKey: ['commerce', businessId], queryFn: () => loadCommerce({ data: { businessId } }), enabled: !!businessId });
  const lowStock = useLowStock(businessId, branches, branchId);
  const business = businesses.data?.find(b => b.id === businessId);
  const today = todayAd();
  // Same totals function as before; the dashboard now always reads "today" for sales and purchases.
  const values = commerce.data ? commerceTotals(commerce.data, branchId, today, today) : financialAvailability();
  const recent = commerce.data?.documents.filter(d => d.status === 'confirmed' && (!branchId || d.branch_id === branchId)).slice(0, 5) ?? [];
  const actions: { to: string; label: string; icon: LucideIcon; search?: { new: '1' } }[] = [
    { to: '/sales', label: 'New sale', icon: Receipt, search: { new: '1' } },
    { to: '/purchases', label: 'New purchase', icon: ShoppingBag, search: { new: '1' } },
    { to: '/products', label: 'Add item', icon: Package },
    { to: '/contacts', label: 'Add party', icon: UsersRound },
    { to: '/expenses', label: 'Add expense', icon: Wallet },
    { to: '/sales', label: 'Receive payment', icon: ArrowDownToLine },
  ];
  return <main className="mx-auto max-w-6xl px-4 py-5 md:px-9 md:py-8">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="brand text-2xl font-semibold">{business?.name || 'BizSathi Nepal'}</h1><p className="mt-1 text-sm text-muted-foreground">{formatBsAd(today)}{business ? ` · ${business.role}` : ''}</p></div>
      <Button asChild variant="outline" size="sm"><Link to="/businesses"><Building2 />{business ? 'Manage business' : 'Register business'}</Link></Button>
    </header>
    {(businesses.isPending || (businessId && access.isPending)) && <p role="status" className="py-6 text-sm">Loading your workspace…</p>}
    {(businesses.error || access.error) && <div className="my-6 flex flex-wrap items-center gap-4"><p role="alert" className="text-sm text-destructive">{businesses.error?.message || access.error?.message}</p><Button variant="outline" onClick={() => { businesses.refetch(); if (businessId) access.refetch(); }}>Try again</Button></div>}
    {(businesses.data?.length ?? 0) > 1 || branches.length > 1 ? <div className="mt-4 grid gap-3 sm:grid-cols-2 md:max-w-xl">
      <label className="text-xs text-muted-foreground">Business<select aria-label="Dashboard business" className={selectClass} disabled={!businesses.data?.length} value={businessId} onChange={e => { setSelected(e.target.value); setBranch(''); }}><option value="">No business selected</option>{businesses.data?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="text-xs text-muted-foreground">Branch<select aria-label="Dashboard branch" className={selectClass} disabled={!branches.length} value={branchId} onChange={e => setBranch(e.target.value)}><option value="">{branches.length ? 'All authorized branches' : 'No authorized branches'}</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    </div> : null}
    {!businesses.isPending && !businesses.error && !businessId && <section className="my-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-secondary/40 p-5"><div><h2 className="brand text-xl">No business linked yet</h2><p className="mt-2 text-sm text-muted-foreground">Register your business or accept a staff invitation.</p></div><Button asChild><Link to="/businesses"><Building2 />Business setup</Link></Button></section>}
    {commerce.error && <p role="alert" className="mt-4 text-sm text-destructive">{commerce.error.message}</p>}

    <section aria-label="Summary" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Today's sales" value={formatNPR(values.sales)} hint={values.sales === null ? 'Not available yet' : 'Confirmed today'} icon={TrendingUp} />
      <StatCard label="Receivable" value={formatNPR(values.receivables)} hint="Customers owe you" icon={ArrowDownToLine} to="/sales" />
      <StatCard label="Payable" value={formatNPR(values.payables)} hint="You owe suppliers" icon={ArrowUpFromLine} tone="text-destructive" to="/purchases" />
      <StatCard label="Low stock" value={lowStock.inventory.isPending && businessId ? '…' : String(lowStock.rows.length)} hint="Items at or below reorder level" icon={AlertTriangle} tone="text-destructive" to="/inventory" />
    </section>

    <section aria-label="Quick actions" className="mt-5"><h2 className="mb-2 text-sm font-semibold">Quick actions</h2><div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{actions.map(a => <Link key={a.label} to={a.to} {...(a.search ? { search: a.search } : {})} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border bg-card p-2 text-center text-xs font-medium shadow-sm transition-colors hover:bg-secondary/60"><span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary"><a.icon className="size-4" /></span>{a.label}</Link>)}</div></section>

    <section aria-label="Balances" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
      <StatCard label="Cash balance" value={formatNPR(values.cash)} hint="Confirmed operational balance" icon={Wallet} />
      <StatCard label="Bank balance" value={formatNPR(values.bank)} hint="Confirmed operational balance" icon={Banknote} />
      <StatCard label="Today's purchases" value={formatNPR(values.purchases)} hint="Confirmed today" icon={ShoppingBag} />
    </section>

    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <section className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Recent transactions</h2><Button asChild variant="ghost" size="sm"><Link to="/sales"><Plus />New</Link></Button></div>{recent.map(d => <div key={d.id} className="flex items-center justify-between gap-3 border-b py-3 text-sm last:border-0"><span className="min-w-0"><span className="block break-words">{d.reference}</span><span className="block text-xs text-muted-foreground">{d.kind.replaceAll('_', ' ')} · {formatBsAd(d.document_date)}</span></span><span className="shrink-0 font-medium tabular-nums">{formatNPR(d.total)}</span></div>)}{!recent.length && <p className="py-8 text-center text-sm text-muted-foreground">No transaction records.</p>}</section>
      <section className="rounded-xl border bg-card p-4 shadow-sm"><h2 className="text-sm font-semibold">Low-stock items</h2><LowStockSummary businessId={businessId} branches={branches} branchId={branchId} /></section>
    </div>
  </main>;
}
