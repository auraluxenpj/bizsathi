import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, ArrowUpRight, Award, Banknote, Boxes, ClipboardCheck, ClipboardList, LayoutDashboard, ListFilter, NotebookPen, PackagePlus, Receipt, ScanBarcode, ShieldAlert, ShoppingCart, SlidersHorizontal, Truck, UserCog, UserPlus, Users, Wallet, Warehouse, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBusinessAccess } from '@/lib/business.functions';
import { getCommerce } from '@/lib/commerce.functions';
import { allowedActions, countOnDay, entryDayCounts, localDay, openDrawer, saleDayTotals } from '@/lib/dashboard-profile';
import { formatBsAd, formatNPR, todayAd } from '@/lib/format';
import { permissionForRoute } from '@/lib/permissions';
import { useCan, usePermissionDenials } from './permission-checklist';
import { LowStockSummary, useLowStock } from './low-stock-summary';
import { ActionGrid, DashboardShell, Notice, Panel, StatCard, usePersonName, type DashboardAction } from './dashboard-widgets';

type DeskProps = { businessId: string; businessName: string };

/**
 * What the member may open. Unlike the sidebar (which stays visible while permissions load), role desks fail closed:
 * nothing is shown or fetched for a permission until the member's checklist has actually loaded.
 */
function useRoleAccess(businessId: string) {
  const can = useCan(businessId);
  const ready = usePermissionDenials(businessId).isSuccess;
  const allowed = (permission: string) => ready && can(permission);
  const routeVisible = (to: string) => { const permission = permissionForRoute(to); return !permission || allowed(permission); };
  return { ready, allowed, routeVisible };
}

const subtitleFor = (businessName: string, today: string, person: string) => `${businessName} · ${formatBsAd(today)}${person ? ` · ${person}` : ''}`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

const cashierActions: DashboardAction[] = [
  { to: '/pos', label: 'Barcode POS', icon: Zap, permission: 'sales.create' },
  { to: '/cash-counters', label: 'Cash drawer', icon: Banknote },
  { to: '/sales', label: 'Sale invoices', icon: Receipt },
  { to: '/parties', label: 'Customers', icon: Users },
  { to: '/membership', label: 'Membership & loyalty', icon: Award },
  { to: '/hrm', label: 'My attendance & leave', icon: UserCog },
];
const entryActions: DashboardAction[] = [
  { to: '/sales', label: 'Sale invoice', icon: Receipt, search: { new: '1' }, permission: 'sales.create' },
  { to: '/purchases', label: 'Purchase invoice', icon: ShoppingCart, search: { new: '1' }, permission: 'purchases.create' },
  { to: '/expenses', label: 'Add expense', icon: Wallet, permission: 'expenses.create' },
  { to: '/parties', label: 'Add customer', icon: UserPlus, permission: 'customers.create' },
  { to: '/contacts', label: 'Add supplier', icon: Truck, search: { kind: 'supplier' }, permission: 'suppliers.create' },
  { to: '/notebook', label: 'Notebook', icon: NotebookPen, permission: 'notebook.create' },
];
const stockActions: DashboardAction[] = [
  { to: '/products', label: 'Add product', icon: PackagePlus, permission: 'inventory.create' },
  { to: '/inventory', label: 'Stock adjustment', icon: SlidersHorizontal, search: { tool: 'adjust' }, permission: 'stock.create' },
  { to: '/inventory', label: 'Physical count', icon: ClipboardCheck, search: { tool: 'count' }, permission: 'stock.create' },
  { to: '/purchases', label: 'Receive purchase', icon: ShoppingCart, search: { new: '1' }, permission: 'purchases.create' },
  { to: '/purchase-orders', label: 'Purchase orders', icon: ClipboardList },
  { to: '/products', label: 'Barcode studio', icon: ScanBarcode, search: { tool: 'barcode' } },
  { to: '/contacts', label: 'Suppliers', icon: Truck, search: { kind: 'supplier' }, permission: 'suppliers.view' },
];

/** Cashier desk: own bills, own drawer, POS. The server already limits a cashier's data to their own sales and drawer sessions. */
export function CashierDashboard({ businessId, businessName }: DeskProps) {
  const person = usePersonName(); const { ready, allowed, routeVisible } = useRoleAccess(businessId); const today = todayAd();
  return <DashboardShell title="Cashier desk" icon={Zap} subtitle={subtitleFor(businessName, today, person)}>
    <ActionGrid title="Quick actions" actions={allowedActions(cashierActions, routeVisible, allowed)} />
    {!ready ? <Notice>Checking your access…</Notice> : allowed('sales.create') || allowed('sales.view') ? <ActivityDesk kind="cashier" businessId={businessId} today={today} /> : <Notice>Sales access has not been turned on for your account. Ask your administrator.</Notice>}
  </DashboardShell>;
}

/** Entry desk: shortcuts for recording documents, plus only the entries this member made. */
export function EntryDashboard({ businessId, businessName }: DeskProps) {
  const person = usePersonName(); const { ready, allowed, routeVisible } = useRoleAccess(businessId); const today = todayAd();
  const canSee = ['sales.view', 'purchases.view', 'sales.create', 'purchases.create'].some(allowed);
  return <DashboardShell title="Data entry desk" icon={ClipboardList} subtitle={subtitleFor(businessName, today, person)}>
    <ActionGrid title="Quick actions" actions={allowedActions(entryActions, routeVisible, allowed)} />
    {!ready ? <Notice>Checking your access…</Notice> : canSee ? <ActivityDesk kind="entry" businessId={businessId} today={today} /> : <Notice>Entry access has not been turned on for your account. Ask your administrator.</Notice>}
  </DashboardShell>;
}

function ActivityDesk({ kind, businessId, today }: { kind: 'cashier' | 'entry'; businessId: string; today: string }) {
  const load = useServerFn(getCommerce);
  const { routeVisible } = useRoleAccess(businessId);
  const commerce = useQuery({ queryKey: ['commerce', businessId], queryFn: () => load({ data: { businessId } }), enabled: Boolean(businessId) });
  const d = commerce.data;
  const documents = d?.documents ?? [];
  const mine = kind === 'cashier' ? documents : documents.filter(x => x.actor_id === d?.userId);
  const recent = mine.filter(x => x.status === 'confirmed').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);
  const sold = saleDayTotals(mine, today);
  const entered = d ? entryDayCounts(documents, d.userId, today) : { sales: 0, purchases: 0 };
  const drawer = d ? openDrawer(d.counters, d.userId) : undefined;
  const dash = '—';
  return <>
    {commerce.isPending && <p role="status" className="py-4 text-sm text-muted-foreground">Loading your activity…</p>}
    {commerce.error && <div className="flex flex-wrap items-center gap-3 py-4"><p role="alert" className="text-sm text-destructive">{commerce.error.message}</p><Button variant="outline" onClick={() => { void commerce.refetch(); }}>Try again</Button></div>}
    <section aria-label="Today" className="dashboard-summary mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {kind === 'cashier' ? <>
        <StatCard label="My sales today" value={d ? formatNPR(sold.net) : dash} icon={Receipt} tone="bg-revenue/10 text-revenue" to={routeVisible('/sales') ? '/sales' : undefined} subtitle="Net of returns" />
        <StatCard label="Bills today" value={d ? String(sold.bills) : dash} icon={ClipboardList} tone="bg-purchase/10 text-purchase" to={routeVisible('/sales') ? '/sales' : undefined} subtitle={d ? plural(sold.returns, 'return') : 'Confirmed invoices'} />
        <StatCard label="Cash drawer" value={d ? (drawer ? 'Open' : 'Closed') : dash} icon={Banknote} tone="bg-warning/10 text-warning" to={routeVisible('/cash-counters') ? '/cash-counters' : undefined} subtitle={drawer ? `Opening cash ${formatNPR(drawer.amount)}` : 'Open your drawer before billing'} />
      </> : <>
        <StatCard label="Sales entered today" value={d ? String(entered.sales) : dash} icon={Receipt} tone="bg-revenue/10 text-revenue" to={routeVisible('/sales') ? '/sales' : undefined} subtitle="Confirmed by you" />
        <StatCard label="Purchases entered today" value={d ? String(entered.purchases) : dash} icon={ShoppingCart} tone="bg-purchase/10 text-purchase" to={routeVisible('/purchases') ? '/purchases' : undefined} subtitle="Confirmed by you" />
      </>}
    </section>
    <div className="mt-5">
      <Panel title={kind === 'cashier' ? 'My recent bills' : 'My recent entries'} action={routeVisible('/sales') ? <Button asChild variant="ghost" size="sm"><Link to="/sales">View all<ArrowUpRight className="size-3.5" /></Link></Button> : undefined}>
        <div className="mt-3 divide-y">
          {recent.map(x => <div key={x.id} className="flex min-w-0 items-center gap-3 py-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Receipt className="size-4" /></span><span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{x.reference}</span><span className="block text-[11px] capitalize text-muted-foreground">{x.kind.replaceAll('_', ' ')} · {formatBsAd(x.document_date)}</span></span><span className="shrink-0 text-sm font-medium tabular-nums">{formatNPR(x.total)}</span></div>)}
          {!recent.length && <p className="py-8 text-sm text-muted-foreground">{d ? 'Nothing confirmed by you yet.' : 'Activity unavailable until records load.'}</p>}
        </div>
      </Panel>
    </div>
  </>;
}

/** Stock desk: stock health and movements only. It never loads sales, cash or accounting records. */
export function StockDashboard({ businessId, businessName }: DeskProps) {
  const person = usePersonName(); const { ready, allowed, routeVisible } = useRoleAccess(businessId); const today = todayAd();
  return <DashboardShell title="Stock desk" icon={Warehouse} subtitle={subtitleFor(businessName, today, person)}>
    <ActionGrid title="Quick actions" actions={allowedActions(stockActions, routeVisible, allowed)} />
    {!ready ? <Notice>Checking your access…</Notice> : allowed('inventory.view') ? <StockDesk businessId={businessId} today={today} /> : <Notice>Stock access has not been turned on for your account. Ask your administrator.</Notice>}
  </DashboardShell>;
}

function StockDesk({ businessId, today }: { businessId: string; today: string }) {
  const loadAccess = useServerFn(getBusinessAccess);
  const { routeVisible } = useRoleAccess(businessId);
  const [branch, setBranch] = useState('');
  const access = useQuery({ queryKey: ['business-access', businessId], queryFn: () => loadAccess({ data: { businessId } }), enabled: Boolean(businessId) });
  const branches = access.data?.branches.filter(b => b.is_active) ?? [];
  const branchId = branches.some(b => b.id === branch) ? branch : '';
  const { inventory, rows } = useLowStock(businessId, branches, branchId);
  const variants = inventory.data?.variants ?? [];
  const byId = new Map(variants.map(v => [v.id, v] as const));
  const items = variants.filter(v => v.is_active && v.products?.is_active).length;
  const out = rows.filter(r => r.quantity <= 0).length;
  const low = rows.length - out;
  const movements = (inventory.data?.movements ?? []).filter(m => !branchId || m.branch_id === branchId);
  const recent = movements.slice(0, 8);
  const loaded = Boolean(inventory.data);
  const dash = '—';
  return <>
    <section aria-label="Stock filters" className="mt-5 flex flex-wrap items-end justify-between gap-3 rounded-2xl border bg-card px-4 py-4 shadow-sm sm:px-5">
      <label className="text-xs text-muted-foreground">Branch<select aria-label="Stock branch" className="mt-1 block h-9 max-w-full rounded-md border bg-card px-3 text-xs text-foreground" value={branchId} onChange={e => setBranch(e.target.value)} disabled={!branches.length}><option value="">All authorized branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <Button variant="outline" size="sm" disabled={inventory.isFetching} onClick={() => { void inventory.refetch(); }}>Refresh</Button>
    </section>
    {inventory.isPending && <p role="status" className="py-4 text-sm text-muted-foreground">Loading stock…</p>}
    {inventory.error && <div className="flex flex-wrap items-center gap-3 py-4"><p role="alert" className="text-sm text-destructive">{inventory.error.message}</p><Button variant="outline" onClick={() => { void inventory.refetch(); }}>Try again</Button></div>}
    <section aria-label="Stock summary" className="dashboard-summary mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Active items" value={loaded ? String(items) : dash} icon={Boxes} tone="bg-purchase/10 text-purchase" to={routeVisible('/products') ? '/products' : undefined} subtitle="Products you can stock" />
      <StatCard label="Low stock" value={loaded ? String(low) : dash} icon={ListFilter} tone="bg-warning/10 text-warning" to="/inventory" subtitle="At or below reorder level" />
      <StatCard label="Out of stock" value={loaded ? String(out) : dash} icon={ShieldAlert} tone="bg-expense/10 text-expense" to="/inventory" subtitle="Nothing on hand" />
      <StatCard label="Movements today" value={loaded ? String(countOnDay(movements, today)) : dash} icon={ArrowLeftRight} tone="bg-revenue/10 text-revenue" to="/inventory" subtitle="Stock in, out and adjustments" />
    </section>
    <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-2">
      <Panel title="Needs restocking"><LowStockSummary businessId={businessId} branches={branches} branchId={branchId} /></Panel>
      <Panel title="Recent stock movements" action={<Button asChild variant="ghost" size="sm"><Link to="/inventory">Stock ledger<ArrowUpRight className="size-3.5" /></Link></Button>}>
        <div className="mt-3 divide-y">
          {recent.map(m => { const v = byId.get(m.variant_id); return <div key={m.id} className="flex min-w-0 items-center gap-3 py-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><ArrowLeftRight className="size-4" /></span><span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{v?.products?.name ?? 'Item'}{v?.sku ? ` · ${v.sku}` : ''}</span><span className="block text-[11px] capitalize text-muted-foreground">{String(m.kind ?? 'movement').replaceAll('_', ' ')} · {formatBsAd(localDay(m.created_at))}</span></span><span className={`shrink-0 text-sm font-semibold tabular-nums ${m.quantity < 0 ? 'text-expense' : 'text-revenue'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</span></div>; })}
          {!recent.length && <p className="py-8 text-sm text-muted-foreground">{loaded ? 'No stock movements recorded.' : 'Movements unavailable until stock loads.'}</p>}
        </div>
      </Panel>
    </div>
  </>;
}

/** Shown on the business overview when the owner has unticked "View Homepage Stats" for this member. */
export function LimitedDashboard({ businessName, actions }: { businessName: string; actions: DashboardAction[] }) {
  const person = usePersonName(); const today = todayAd();
  return <DashboardShell title="Your dashboard" icon={LayoutDashboard} subtitle={subtitleFor(businessName, today, person)}>
    <Notice>Business statistics are turned off for your account. Your shortcuts are below.</Notice>
    <ActionGrid title="Shortcuts" actions={actions} />
  </DashboardShell>;
}
