import { Link } from '@tanstack/react-router';
import { Archive, Banknote, Home, LayoutGrid, Package, Receipt, ShoppingCart, Truck, Users, type LucideIcon } from 'lucide-react';
import type { DashboardKind } from '@/lib/dashboard-profile';

type Tab = { to: string; label: string; icon: LucideIcon; match: string[]; permission?: string };

const home: Tab = { to: '/dashboard', label: 'Home', icon: Home, match: ['/dashboard'] };
const pos: Tab = { to: '/pos', label: 'POS', icon: ShoppingCart, match: ['/pos'], permission: 'sales.create' };
const parties: Tab = { to: '/parties', label: 'Parties', icon: Users, match: ['/parties', '/contacts'], permission: 'customers.view' };
const more: Tab = { to: '/more', label: 'More', icon: LayoutGrid, match: ['/more'] };

/** Each role gets the bottom tabs for its own work. A tab also disappears when the member's checklist removes its permission. */
const tabsByKind: Record<DashboardKind, Tab[]> = {
  business: [home, pos, parties, { to: '/inventory', label: 'Inventory', icon: Archive, match: ['/inventory', '/products', '/categories'], permission: 'inventory.view' }, more],
  // Billing staff are limited to these pages; /more and /inventory would only bounce them back to POS.
  cashier: [home, pos, parties, { to: '/cash-counters', label: 'Drawer', icon: Banknote, match: ['/cash-counters'], permission: 'sales.create' }],
  stock: [home, { to: '/inventory', label: 'Stock', icon: Archive, match: ['/inventory'], permission: 'inventory.view' }, { to: '/products', label: 'Products', icon: Package, match: ['/products', '/categories'], permission: 'inventory.view' }, { to: '/purchases', label: 'Purchases', icon: Truck, match: ['/purchases', '/purchase-orders'], permission: 'purchases.view' }, more],
  entry: [home, { to: '/sales', label: 'Sales', icon: Receipt, match: ['/sales'], permission: 'sales.view' }, { to: '/purchases', label: 'Purchases', icon: Truck, match: ['/purchases'], permission: 'purchases.view' }, parties, more],
};

export function MobileTabBar({ pathname, kind = 'business', can = () => true }: { pathname: string; kind?: DashboardKind; can?: (permission: string) => boolean }) {
  const tabs = tabsByKind[kind].filter(t => !t.permission || can(t.permission));
  return <nav aria-label="Main" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} className="mobile-tab-bar fixed inset-x-0 bottom-0 z-30 grid min-h-16 items-stretch border-t bg-card pb-[env(safe-area-inset-bottom)] font-[Inter,sans-serif] shadow-[0_-6px_24px_oklch(0.2_0.02_70_/_6%)] lg:hidden">
    {tabs.map(t => { const on = t.match.some(m => pathname === m || pathname.startsWith(`${m}/`)); return <Link key={t.to} to={t.to} aria-current={on ? 'page' : undefined} className={`relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold leading-tight ${on ? 'text-[#2347D9]' : 'text-[#55607A]'}`}>{on && <span className="absolute left-0 top-0 h-0.5 w-full bg-[#2F5BF0]" />}<t.icon className="size-[21px]" fill={on ? 'currentColor' : 'none'} />{t.label}</Link>; })}
  </nav>;
}
