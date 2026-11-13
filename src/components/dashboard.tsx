import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { LayoutDashboard, Receipt, ShoppingCart, Package, UserRound, Wallet, BarChart3, Wrench, UsersRound, UserCog, LogOut, Plus, Menu, ChevronDown, ChevronRight, Building2, ArrowLeftRight, Landmark, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CommandPalette } from '@/components/command-palette';
import { listBusinesses } from '@/lib/business.functions';
import { supabase } from '@/integrations/supabase/client';
import { validateReportSearch } from '@/lib/report-filters';

import { useCan } from './permission-checklist';
import { routePermission } from '@/lib/permissions';

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
  { to: '/dashboard', name: 'Home', icon: LayoutDashboard },
  { to: '/transactions', name: 'Transactions', icon: ArrowLeftRight },
  { to: '/parties', name: 'Parties', icon: UserRound },
  { to: '/products', name: 'Inventory', icon: Package },
];

const isActive = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

function Row({ entry, pathname }: { entry: Entry; pathname: string }) {
  const search = useSearch({ strict: false });
  const reportLink = ['/reports', '/accounting', '/transactions'].includes(entry.to ?? '') && ['/reports', '/accounting', '/transactions'].includes(pathname);
  const childActive = entry.children?.some(c => isActive(pathname, c.to)) ?? false;
  const [open, setOpen] = useState(childActive);
  const base = 'group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all duration-200';

  if (entry.children) {
    return (
      <div>
        <button
          type="button"
          aria-expanded={open || childActive}
          onClick={() => setOpen(o => !o)}
          className={`${base} ${childActive ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10' : 'text-emerald-50/80 hover:bg-white/5 hover:text-white'}`}
        >
          <entry.icon className="size-4 shrink-0" />
          <span className="flex-1 text-left">{entry.name}</span>
          {open || childActive ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        {(open || childActive) && (
          <div className="ml-7 mt-1 space-y-1 border-l border-white/10 pl-3">
            {entry.children.map(c => (
              <Link
                key={c.to}
                to={c.to}
                aria-current={isActive(pathname, c.to) ? 'page' : undefined}
                className={`flex min-h-9 items-center rounded-lg px-2.5 text-sm transition-colors ${isActive(pathname, c.to) ? 'bg-white/10 text-white' : 'text-emerald-50/75 hover:bg-white/5 hover:text-white'}`}
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!entry.to) return null;
  const active = isActive(pathname, entry.to);
  return (
    <Link
      to={entry.to}
      search={reportLink ? validateReportSearch(search) : {}}
      aria-current={active ? 'page' : undefined}
      className={`${base} ${active ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10' : 'text-emerald-50/80 hover:bg-white/5 hover:text-white'}`}
    >
      <entry.icon className="size-4 shrink-0" />
      <span className="flex-1 text-left">{entry.name}</span>
    </Link>
  );
}

export function AppNavigation({ children, pathname }: { children: ReactNode; pathname: string }) {
  const load = useServerFn(listBusinesses);
  const client = useQueryClient();
  const navigate = useNavigate();
  const [person, setPerson] = useState('');
  const businesses = useQuery({ queryKey: ['businesses'], queryFn: () => load() });
  const admin = businesses.data?.some(b => b.role === 'owner' || b.role === 'admin');
  const can = useCan(businesses.data?.[0]?.id ?? '');
  const visible = (to?: string) => !to || !routePermission[to] || can(routePermission[to]!);
  const allow = (list: Entry[]) => list.filter(e => visible(e.to)).map(e => e.children ? { ...e, children: e.children.filter(c => visible(c.to)) } : e);
  const deniedPage = Object.keys(routePermission).some(r => isActive(pathname, r) && !visible(r));
  const businessName = businesses.data?.[0]?.name ?? 'BizSathi';

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      setPerson((u?.user_metadata?.['full_name'] as string | undefined) || u?.email?.split('@')[0] || '');
    });
  }, []);

  const management: Entry[] = [
    { name: 'Reports', icon: BarChart3, to: '/reports' },
    { name: 'Manage Staff', icon: UsersRound, to: '/businesses' },
    { name: 'Business Tools', icon: Wrench, children: [{ to: '/credit-reminder', name: 'Credit reminder' }, { to: '/calculators', name: 'Calculators' }, { to: '/inventory', name: 'Stock ledger' }, ...(admin ? adminTools : [])] },
    { name: 'My account', icon: UserCog, to: '/profile' },
  ];

  async function signOut() {
    await client.cancelQueries();
    client.clear();
    await supabase.auth.signOut();
    await navigate({ to: '/auth', replace: true });
  }

  const moreActive = !bottomTabs.some(t => isActive(pathname, t.to));

  return (
    <div className="min-h-screen bg-background lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-emerald-900/40 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_40%),linear-gradient(180deg,_#064E3B_0%,_#022C22_100%)] text-emerald-50 lg:flex">
        <div className="p-4">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 shadow-[0_12px_30px_rgba(2,44,34,0.18)] backdrop-blur-sm">
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-50">
              <Building2 className="size-5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{businessName}</span>
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Business</p>
          {allow(business).map(e => <Row key={e.name} entry={e} pathname={pathname} />)}
          <p className="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Management</p>
          {allow(management).map(e => <Row key={e.name} entry={e} pathname={pathname} />)}
        </nav>
      </aside>

      <header className="sticky top-0 z-20 hidden h-16 items-center gap-4 border-b border-emerald-100 bg-white/80 px-6 backdrop-blur-xl lg:flex">
        <div className="flex flex-1 justify-center">
          <CommandPalette className="w-full max-w-md" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-900 hover:bg-emerald-100/80">
              <span className="flex size-8 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-semibold uppercase text-emerald-700">
                {person ? person.slice(0, 1).toUpperCase() : 'B'}
              </span>
              <span className="text-sm font-medium">{person || 'BizSathi'}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => navigate({ to: '/profile' })}>My account</DropdownMenuItem>
            <DropdownMenuItem onSelect={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-emerald-100 bg-white/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Link to="/dashboard" className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Building2 className="size-5" />
          </span>
          <span className="truncate text-sm font-semibold text-emerald-900">{businessName}</span>
        </Link>
        <div className="flex items-center gap-2">
          <CommandPalette variant="icon" shortcut={false} />
          <Button variant="ghost" size="icon" className="rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100" aria-label="Open menu" title="Menu">
            <Menu className="size-4" />
          </Button>
        </div>
      </header>

      <div className="min-w-0 pb-24 lg:pb-0">
        {deniedPage ? (
          <main className="mx-auto max-w-xl px-5 py-16 text-center">
            <h1 className="brand text-2xl text-emerald-900">No access</h1>
            <p className="mt-3 text-sm text-muted-foreground">You do not have permission to view this page.</p>
          </main>
        ) : (
          children
        )}
      </div>

      {pathname === '/dashboard' && (
        <Link to="/sales" search={{ new: '1' }} className="fixed bottom-20 right-4 z-30 flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/20 transition-transform hover:scale-[1.02] lg:hidden">
          <Plus className="size-4" /> New sale
        </Link>
      )}

      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-emerald-100 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {bottomTabs.map(item => {
          const active = isActive(pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${active ? 'bg-emerald-50 font-semibold text-emerald-700' : 'text-muted-foreground'}`}
            >
              <item.icon className="size-4" />
              {item.name}
            </Link>
          );
        })}
        <Link to="/more" aria-current={pathname === '/more' ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${pathname === '/more' || moreActive ? 'bg-emerald-50 font-semibold text-emerald-700' : 'text-muted-foreground'}`}>
          <Menu className="size-4" />
          More
        </Link>
      </nav>
    </div>
  );
}
