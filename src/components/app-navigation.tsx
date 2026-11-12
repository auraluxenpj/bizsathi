import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { LayoutDashboard, Receipt, ShoppingCart, Package, UserRound, Wallet, BarChart3, Wrench, UsersRound, UserCog, LogOut, Plus, Menu, ChevronDown, ChevronRight, Building2, ArrowLeftRight, Landmark, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CommandPalette } from '@/components/command-palette';
import { listBusinesses } from '@/lib/business.functions';
import { supabase } from '@/integrations/supabase/client';

type Leaf = { to: string; name: string };
type Entry = { name: string; icon: LucideIcon; to?: string; children?: Leaf[] };

const business: Entry[] = [
  { name: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { name: 'Transactions', icon: ArrowLeftRight, to: '/transactions' },
  { name: 'Parties', icon: UserRound, to: '/parties' },
  { name: 'Inventory', icon: Package, to: '/products' },
  { name: 'Sales', icon: Receipt, children: [{ to: '/sales', name: 'Sales invoices' }, { to: '/quotations', name: 'Quotations / estimates' }, { to: '/pos', name: 'Quick POS' }, { to: '/cash-counters', name: 'Cash counters' }] },
  { name: 'Purchase', icon: ShoppingCart, children: [{ to: '/purchases', name: 'Purchase bills' }, { to: '/purchase-orders', name: 'Purchase orders' }] },
  { name: 'Expense', icon: Wallet, to: '/expenses' },
  { name: 'Cash & Bank', icon: Landmark, to: '/cash-bank' },
];
const adminTools: Leaf[] = [{ to: '/security', name: 'Security findings' }, { to: '/security-history', name: 'Review history' }];
const bottomTabs: { to: string; name: string; icon: LucideIcon }[] = [
  { to: '/dashboard', name: 'Home', icon: LayoutDashboard }, { to: '/transactions', name: 'Transactions', icon: ArrowLeftRight },
  { to: '/parties', name: 'Parties', icon: UserRound }, { to: '/products', name: 'Inventory', icon: Package },
];

const isActive = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

function Row({ entry, pathname }: { entry: Entry; pathname: string }) {
  const childActive = entry.children?.some(c => isActive(pathname, c.to)) ?? false;
  const [open, setOpen] = useState(childActive);
  const base = 'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors';
  if (entry.children) {
    return <div>
      <button type="button" aria-expanded={open || childActive} onClick={() => setOpen(o => !o)} className={`${base} text-foreground/80 hover:bg-secondary`}>
        <entry.icon className="size-4 shrink-0" /><span className="flex-1 text-left">{entry.name}</span>{open || childActive ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
      </button>
      {(open || childActive) && <div className="ml-7 mt-1 space-y-1 border-l pl-3">{entry.children.map(c => <Link key={c.to} to={c.to} aria-current={isActive(pathname, c.to) ? 'page' : undefined} className={`flex min-h-10 items-center rounded-lg px-3 text-sm ${isActive(pathname, c.to) ? 'font-semibold text-primary' : 'text-foreground/70 hover:bg-secondary'}`}>{c.name}</Link>)}</div>}
    </div>;
  }
  const active = isActive(pathname, entry.to!);
  return <Link to={entry.to!} aria-current={active ? 'page' : undefined} className={`${base} ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/80 hover:bg-secondary'}`}><entry.icon className="size-4 shrink-0" />{entry.name}</Link>;
}

import { useCan } from './permission-checklist';
import { routePermission } from '@/lib/permissions';
export function AppNavigation({ children, pathname }: { children: ReactNode; pathname: string }) {
  const load = useServerFn(listBusinesses); const client = useQueryClient(); const navigate = useNavigate();
  const [person, setPerson] = useState('');
  const businesses = useQuery({ queryKey: ['businesses'], queryFn: () => load() });
  // Same rule as before: administrator-only links appear for owners and admins.
  const admin = businesses.data?.some(b => b.role === 'owner' || b.role === 'admin');
  const can = useCan(businesses.data?.[0]?.id ?? '');
  const visible = (to?: string) => !to || !routePermission[to] || can(routePermission[to]!);
  const allow = (list: Entry[]) => list.filter(e => visible(e.to)).map(e => e.children ? { ...e, children: e.children.filter(c => visible(c.to)) } : e);
  const deniedPage = Object.keys(routePermission).some(r => isActive(pathname, r) && !visible(r));
  const businessName = businesses.data?.[0]?.name ?? 'BizSathi';
  useEffect(() => { supabase.auth.getUser().then(({ data }) => { const u = data.user; setPerson((u?.user_metadata?.['full_name'] as string | undefined) || u?.email?.split('@')[0] || ''); }); }, []);
  const management: Entry[] = [
    { name: 'Reports', icon: BarChart3, to: '/reports' },
    { name: 'Manage Staff', icon: UsersRound, to: '/businesses' },
    { name: 'Business Tools', icon: Wrench, children: [{ to: '/credit-reminder', name: 'Credit reminder' }, { to: '/calculators', name: 'Calculators' }, { to: '/inventory', name: 'Stock ledger' }, ...(admin ? adminTools : [])] },
    { name: 'My account', icon: UserCog, to: '/profile' },
  ];
  async function signOut() { await client.cancelQueries(); client.clear(); await supabase.auth.signOut(); await navigate({ to: '/auth', replace: true }); }
  const moreActive = !bottomTabs.some(t => isActive(pathname, t.to));

  return (
    <div className="min-h-screen bg-background lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card lg:flex">
        <div className="p-4"><div className="flex items-center gap-3 rounded-xl border px-3 py-2.5"><span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="size-5" /></span><span className="min-w-0 flex-1 truncate text-sm font-semibold">{businessName}</span></div></div>
        <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          <p className="px-3 pb-1 pt-2 text-sm text-muted-foreground">Business</p>
          {allow(business).map(e => <Row key={e.name} entry={e} pathname={pathname} />)}
          <p className="px-3 pb-1 pt-5 text-sm text-muted-foreground">Management</p>
          {allow(management).map(e => <Row key={e.name} entry={e} pathname={pathname} />)}
        </nav>
      </aside>

      <header className="sticky top-0 z-20 hidden h-16 items-center gap-4 border-b bg-card px-6 lg:flex">
        <div className="flex flex-1 justify-center"><CommandPalette className="w-full max-w-md" /></div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" className="gap-2"><span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold uppercase text-primary">{person.slice(0, 1) || 'B'}</span><span className="text-sm font-medium">{person}</span><ChevronDown className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => navigate({ to: '/profile' })}>My account</DropdownMenuItem><DropdownMenuItem onSelect={signOut}><LogOut className="size-4" />Sign out</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
      </header>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-card px-4 py-3 lg:hidden">
        <Link to="/dashboard" className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Building2 className="size-5" /></span><span className="truncate text-base font-semibold">{businessName}</span></Link>
        <CommandPalette variant="icon" shortcut={false} />
      </header>

      <div className="min-w-0 pb-24 lg:pb-0">{deniedPage ? <main className="mx-auto max-w-xl px-5 py-16 text-center"><h1 className="brand text-2xl">No access</h1><p className="mt-3 text-sm text-muted-foreground">Your administrator has turned off access to this page.</p></main> : children}</div>

      {pathname === '/dashboard' && <Link to="/sales" search={{ new: '1' }} className="fixed bottom-20 right-4 z-30 flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg lg:hidden"><Plus className="size-4" />New sale</Link>}

      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        {bottomTabs.map(item => {
          const active = isActive(pathname, item.to);
          return <Link key={item.to} to={item.to} aria-current={active ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${active ? 'font-semibold text-primary' : 'text-muted-foreground'}`}><item.icon className="size-5" />{item.name}</Link>;
        })}
        <Link to="/more" aria-current={pathname === '/more' ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${pathname === '/more' || (moreActive && pathname !== '/') ? 'font-semibold text-primary' : 'text-muted-foreground'}`}><Menu className="size-5" />More</Link>
      </nav>
    </div>
  );
}
