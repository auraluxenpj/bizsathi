import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowUp, BarChart3, Building2, Calculator, Eye, Landmark, MessageSquareText, Package, Plus, Receipt, ShoppingCart, Tag, UserPlus, Wallet, Zap, type LucideIcon } from 'lucide-react';
import Decimal from 'decimal.js';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getBusinessAccess, listBusinesses } from '@/lib/business.functions';
import { authorizedSelection } from '@/lib/dashboard-data';
import { LowStockSummary, useLowStock } from './low-stock-summary';
import { getCommerce } from '@/lib/commerce.functions';
import { commerceTotals } from '@/lib/commerce-totals';
import { addDaysAd, bsMonthInfo, bsShort, compactNPR, formatBsAd, formatNPR, todayAd } from '@/lib/format';
import { supabase } from '@/integrations/supabase/client';

const selectClass = 'mt-1 h-10 w-full rounded-md border bg-card px-3 text-sm text-foreground';

function StatCard({ label, value, icon: Icon, tint, iconTone, to }: { label: string; value: string; icon: LucideIcon; tint: string; iconTone: string; to?: string }) {
  const body = <><Icon className={`size-4 ${iconTone}`} /><p className="mt-4 text-xs text-foreground/70">{label}</p><p className="mt-1 break-words text-lg font-semibold tabular-nums sm:text-xl">{value}</p></>;
  const cls = `min-w-0 rounded-xl p-4 ${tint}`;
  return to ? <Link to={to} className={`${cls} block transition-opacity hover:opacity-80`}>{body}</Link> : <article className={cls}>{body}</article>;
}

export function Dashboard() {
  const list = useServerFn(listBusinesses); const getAccess = useServerFn(getBusinessAccess);
  const businesses = useQuery({ queryKey: ['businesses'], queryFn: () => list() });
  const [selected, setSelected] = useState(''); const [branch, setBranch] = useState('');
  const [privacy, setPrivacy] = useState(false); const [person, setPerson] = useState('');
  useEffect(() => { supabase.auth.getUser().then(({ data }) => { const u = data.user; setPerson((u?.user_metadata?.['full_name'] as string | undefined) || u?.email?.split('@')[0] || ''); }); }, []);
  const businessId = authorizedSelection(businesses.data ?? [], selected);
  const access = useQuery({ queryKey: ['business-access', businessId], queryFn: () => getAccess({ data: { businessId } }), enabled: Boolean(businessId) });
  const branches = access.data?.branches.filter(b => b.is_active) ?? [];
  const branchId = branches.some(b => b.id === branch) ? branch : '';
  const loadCommerce = useServerFn(getCommerce);
  const commerce = useQuery({ queryKey: ['commerce', businessId], queryFn: () => loadCommerce({ data: { businessId } }), enabled: !!businessId });
  const lowStock = useLowStock(businessId, branches, branchId);
  const business = businesses.data?.find(b => b.id === businessId);
  const today = todayAd();
  const month = bsMonthInfo(today);
  const money = (v: number | null | undefined) => (privacy ? 'Rs. ••••' : formatNPR(v));

  // Same totals function as before, now over the current BS month (as Karobar shows).
  const d = commerce.data;
  const monthly = d && month ? commerceTotals(d, branchId, month.fromAd, month.toAd) : null;
  const allTime = d ? commerceTotals(d, branchId, '0000-01-01', '9999-12-31') : null;
  const expenses = d && month ? d.journals.filter(j => (!branchId || j.branch_id === branchId) && j.account_code.startsWith('expense') && j.entry_date >= month.fromAd && j.entry_date <= month.toAd).reduce((s, j) => s.plus(j.debit).minus(j.credit), new Decimal(0)).toNumber() : null;

  // Cashflow: real cash and bank journal movements for the last 7 days.
  const days = Array.from({ length: 7 }, (_, i) => addDaysAd(today, i - 6));
  const flow = days.map(day => {
    const rows = d?.journals.filter(j => (!branchId || j.branch_id === branchId) && (j.account_code === 'cash' || j.account_code === 'bank') && j.entry_date === day) ?? [];
    return { day: bsShort(day), in: rows.reduce((s, j) => s + Number(j.debit), 0), out: rows.reduce((s, j) => s + Number(j.credit), 0) };
  });
  const totalIn = flow.reduce((s, r) => s + r.in, 0); const totalOut = flow.reduce((s, r) => s + r.out, 0);
  const recent = d?.documents.filter(x => x.status === 'confirmed' && (!branchId || x.branch_id === branchId)).slice(0, 6) ?? [];
  const monthName = month?.name ?? 'This month';

  return <main className="mx-auto max-w-7xl px-4 py-5 md:px-8 md:py-7">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">Welcome{person ? ` ${person}` : ''}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-10 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium"><Eye className="size-4" />Privacy Mode<Switch checked={privacy} onCheckedChange={setPrivacy} aria-label="Privacy mode" /></label>
        <Button asChild variant="outline" className="relative h-10 border-primary/30 bg-primary/10 text-foreground hover:bg-primary/20"><Link to="/pos"><Zap />Quick POS<span className="absolute -top-2 right-2 rounded-full bg-destructive px-1.5 text-[10px] font-semibold leading-4 text-white">New</span></Link></Button>
        <Button asChild className="h-10"><Link to="/sales" search={{ new: '1' }}><Plus />Sales</Link></Button>
        <Button asChild className="h-10 bg-blue-600 text-white hover:bg-blue-700"><Link to="/purchases" search={{ new: '1' }}><Plus />Purchase</Link></Button>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="h-10">More</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to="/parties">Receive / give payment</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/products">Add item</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/contacts">Add party</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/expenses">Add expense</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/inventory">Stock ledger</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>
    </header>
    <p className="mt-1 text-sm text-muted-foreground">{formatBsAd(today)}{business ? ` · ${business.name}` : ''}</p>

    {(businesses.isPending || (businessId && access.isPending)) && <p role="status" className="py-6 text-sm">Loading your workspace…</p>}
    {(businesses.error || access.error) && <div className="my-6 flex flex-wrap items-center gap-4"><p role="alert" className="text-sm text-destructive">{businesses.error?.message || access.error?.message}</p><Button variant="outline" onClick={() => { businesses.refetch(); if (businessId) access.refetch(); }}>Try again</Button></div>}
    {(businesses.data?.length ?? 0) > 1 || branches.length > 1 ? <div className="mt-4 grid gap-3 sm:grid-cols-2 md:max-w-xl">
      <label className="text-xs text-muted-foreground">Business<select aria-label="Dashboard business" className={selectClass} disabled={!businesses.data?.length} value={businessId} onChange={e => { setSelected(e.target.value); setBranch(''); }}>{businesses.data?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="text-xs text-muted-foreground">Branch<select aria-label="Dashboard branch" className={selectClass} disabled={!branches.length} value={branchId} onChange={e => setBranch(e.target.value)}><option value="">{branches.length ? 'All authorized branches' : 'No authorized branches'}</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    </div> : null}
    {!businesses.isPending && !businesses.error && !businessId && <section className="my-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-secondary/40 p-5"><div><h2 className="text-xl font-semibold">No business linked yet</h2><p className="mt-2 text-sm text-muted-foreground">Register your business or accept a staff invitation.</p></div><Button asChild><Link to="/businesses"><Building2 />Business setup</Link></Button></section>}
    {commerce.error && <p role="alert" className="mt-4 text-sm text-destructive">{commerce.error.message}</p>}

    <section aria-label="Summary" className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatCard label="To Receive" value={money(allTime?.receivables)} icon={ArrowDown} tint="bg-emerald-50" iconTone="text-emerald-600" to="/parties" />
      <StatCard label="To Give" value={money(allTime?.payables)} icon={ArrowUp} tint="bg-rose-50" iconTone="text-rose-600" to="/parties" />
      <StatCard label={`Sales (${monthName})`} value={money(monthly?.sales)} icon={Tag} tint="bg-emerald-50" iconTone="text-emerald-600" to="/sales" />
      <StatCard label={`Purchase (${monthName})`} value={money(monthly?.purchases)} icon={ShoppingCart} tint="bg-blue-50" iconTone="text-blue-600" to="/purchases" />
      <StatCard label={`Expense (${monthName})`} value={money(expenses)} icon={Wallet} tint="bg-rose-50" iconTone="text-rose-600" to="/expenses" />
    </section>

    <section aria-label="Explore app" className="mt-6"><h2 className="mb-2 text-lg font-semibold">Explore App</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[
      { to: '/expenses', label: 'Quick Entry', icon: Calculator }, { to: '/pos', label: 'Quick POS', icon: Zap },
      { to: '/reports', label: 'View Reports', icon: BarChart3 }, { to: '/credit-reminder', label: 'Credit Reminder', icon: MessageSquareText, badge: 'New' },
    ].map(t => <Link key={t.label} to={t.to} className="relative flex min-h-28 flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-3 text-center text-sm font-medium shadow-sm transition-colors hover:bg-secondary/50"><t.icon className="size-7 text-primary" />{t.label}{'badge' in t && <span className="absolute right-2 top-2 rounded bg-rose-500 px-1.5 text-[10px] font-semibold text-white">{t.badge}</span>}</Link>)}</div></section>
    <section aria-label="Shortcuts" className="mt-6"><h2 className="mb-2 text-lg font-semibold">Shortcuts</h2><div className="grid grid-cols-4 gap-y-5 rounded-2xl border bg-card p-4">{([
      { to: '/contacts', label: 'Add Party', icon: UserPlus }, { to: '/sales', label: 'Sales Invoice', icon: Tag, search: { new: '1' as const } },
      { to: '/parties', label: 'Payment In', icon: ArrowDown }, { to: '/parties', label: 'Payment Out', icon: ArrowUp },
      { to: '/purchases', label: 'Purchase', icon: ShoppingCart, search: { new: '1' as const } }, { to: '/products', label: 'Add Item', icon: Package },
      { to: '/expenses', label: 'Expense', icon: Wallet }, { to: '/cash-bank', label: 'Cash & Bank', icon: Landmark },
      { to: '/transactions', label: 'Transactions', icon: Receipt }, { to: '/calculators', label: 'Calculators', icon: Calculator },
    ] as { to: string; label: string; icon: LucideIcon; search?: { new: '1' } }[]).map(t => <Link key={t.label} to={t.to} {...(t.search ? { search: t.search } : {})} className="flex flex-col items-center gap-2 text-center text-xs font-medium"><span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"><t.icon className="size-5" /></span>{t.label}</Link>)}</div></section>
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <section aria-label="Cashflow" className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Cashflow <span className="text-sm font-normal text-muted-foreground">(Last 7 Days)</span></h2></div>
          <div className="mt-4 h-64" role="img" aria-label={`Cash in ${formatNPR(totalIn)} and cash out ${formatNPR(totalOut)} over the last 7 days`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flow} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={v => (privacy ? '' : compactNPR(Number(v)))} tickLine={false} axisLine={false} fontSize={12} width={44} />
                <Tooltip formatter={(v: number) => money(v)} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="in" name="Money in" fill="#10b981" radius={[2, 2, 0, 0]} maxBarSize={14} />
                <Bar dataKey="out" name="Money out" fill="#ef4444" radius={[2, 2, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex justify-center gap-10 text-center text-sm"><div><p className="text-muted-foreground"><span className="mr-1 inline-block size-2 rounded-full bg-emerald-500" />Total Money In</p><p className="text-lg font-semibold text-emerald-600">{money(totalIn)}</p></div><div><p className="text-muted-foreground"><span className="mr-1 inline-block size-2 rounded-full bg-red-500" />Total Money Out</p><p className="text-lg font-semibold text-red-500">{money(totalOut)}</p></div></div>
        </section>
        <section className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Recent transactions</h2>{recent.map(x => <div key={x.id} className="flex items-center justify-between gap-3 border-b py-3 text-sm last:border-0"><span className="min-w-0"><span className="block break-words font-medium">{x.reference}</span><span className="block text-xs capitalize text-muted-foreground">{x.kind.replaceAll('_', ' ')} · {formatBsAd(x.document_date)}</span></span><span className="shrink-0 font-medium tabular-nums">{money(x.total)}</span></div>)}{!recent.length && <p className="py-8 text-center text-sm text-muted-foreground">No transaction records.</p>}</section>
      </div>
      <div className="space-y-5">
        <section className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Total Balance (Cash &amp; Bank)</p><p className="mt-1 text-2xl font-semibold tabular-nums">{money(allTime ? allTime.cash + allTime.bank : null)}</p><p className="mt-2 text-xs text-muted-foreground">Cash {money(allTime?.cash)} · Bank {money(allTime?.bank)}</p></section>
        <section className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Low stock ({businessId && lowStock.inventory.isPending ? '…' : lowStock.rows.length})</h2></div><LowStockSummary businessId={businessId} branches={branches} branchId={branchId} /></section>
      </div>
    </div>
  </main>;
}
