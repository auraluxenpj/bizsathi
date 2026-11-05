import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { LayoutDashboard, Receipt, ShoppingCart, Package, UserRound, Wallet, BarChart3, Wrench, UsersRound, UserCog, LogOut, Plus, Menu, ChevronDown, ChevronRight, Building2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CommandPalette } from '@/components/command-palette';
import { listBusinesses } from '@/lib/business.functions';
import { supabase } from '@/integrations/supabase/client';

type Leaf = { to: string; name: string };
type Entry = { name: string; icon: LucideIcon; to?: string; children?: Leaf[] };

const business: Entry[] = [
  { name: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { name: 'Parties', icon: UserRound, to: '/parties' },
  { name: 'Inventory', icon: Package, to: '/products' },
  { name: 'Sales', icon: Receipt, children: [{ to: '/sales', name: 'Sales invoices' }, { to: '/pos', name: 'Quick POS' }, { to: '/cash-counters', name: 'Cash counters' }] },
  { name: 'Purchase', icon: ShoppingCart, to: '/purchases' },
  { name: 'Expense', icon: Wallet, to: '/expenses' },
];
const adminTools: Leaf[] = [{ to: '/security', name: 'Security findings' }, { to: '/security-history', name: 'Review history' }];
const bottomTabs: { to: string; name: string; icon: LucideIcon }[] = [
  { to: '/dashboard', name: 'Dashboard', icon: LayoutDashboard }, { to: '/sales', name: 'Sales', icon: Receipt },
  { to: '/products', name: 'Inventory', icon: Package }, { to: '/parties', name: 'Parties', icon: UserRound },
];

const isActive = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

function Row({ entry, pathname, onNavigate }: { entry: Entry; pathname: string; onNavigate?: () => void }) {
  const childActive = entry.children?.some(c => isActive(pathname, c.to)) ?? false;
  const [open, setOpen] = useState(childActive);
  const base = 'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors';
  if (entry.children) {
    return <div>
      <button type="button" aria-expanded={open || childActive} onClick={() => setOpen(o => !o)} className={`${base} text-foreground/80 hover:bg-secondary`}>
        <entry.icon className="size-4 shrink-0" /><span className="flex-1 text-left">{entry.name}</span>{open || childActive ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
      </button>
      {(open || childActive) && <div className="ml-7 mt-1 space-y-1 border-l pl-3">{entry.children.map(c => <Link key={c.to} to={c.to} onClick={onNavigate} aria-current={isActive(pathname, c.to) ? 'page' : undefined} className={`flex min-h-10 items-center rounded-lg px-3 text-sm ${isActive(pathname, c.to) ? 'font-semibold text-primary' : 'text-foreground/70 hover:bg-secondary'}`}>{c.name}</Link>)}</div>}
    </div>;
  }
  const active = isActive(pathname, entry.to!);
  return <Link to={entry.to!} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={`${base} ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/80 hover:bg-secondary'}`}><entry.icon className="size-4 shrink-0" />{entry.name}</Link>;
}

export function AppNavigation({ children, pathname }: { children: ReactNode; pathname: string }) {
  const load = useServerFn(listBusinesses); const client = useQueryClient(); const navigate = useNavigate();
  const [more, setMore] = useState(false);
  const [person, setPerson] = useState('');
  const businesses = useQuery({ queryKey: ['businesses'], queryFn: () => load() });
  // Same rule as before: administrator-only links appear for owners and admins.
  const admin = businesses.data?.some(b => b.role === 'owner' || b.role === 'admin');
  const businessName = businesses.data?.[0]?.name ?? 'BizSathi';
  useEffect(() => { supabase.auth.getUser().then(({ data }) => { const u = data.user; setPerson((u?.user_metadata?.['full_name'] as string | undefined) || u?.email?.split('@')[0] || ''); }); }, []);
  const management: Entry[] = [
    { name: 'Reports', icon: BarChart3, to: '/accounting' },
    { name: 'Manage Staff', icon: UsersRound, to: '/businesses' },
    { name: 'Business Tools', icon: Wrench, children: [{ to: '/inventory', name: 'Stock ledger' }, ...(admin ? adminTools : [])] },
    { name: 'My account', icon: UserCog, to: '/profile' },
  ];
  async function signOut() { await client.cancelQueries(); client.clear(); await supabase.auth.signOut(); await navigate({ to: '/auth', replace: true }); }
  const flat = [...business, ...management].flatMap(e => e.children ? e.children.map(c => ({ ...c, icon: e.icon, name: c.name })) : [{ to: e.to!, name: e.name, icon: e.icon }]);

  return (
    <div className="min-h-screen bg-background lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card lg:flex">
        <div className="p-4"><div className="flex items-center gap-3 rounded-xl border px-3 py-2.5"><span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="size-5" /></span><span className="min-w-0 flex-1 truncate text-sm font-semibold">{businessName}</span></div></div>
        <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          <p className="px-3 pb-1 pt-2 text-sm text-muted-foreground">Business</p>
          {business.map(e => <Row key={e.name} entry={e} pathname={pathname} />)}
          <p className="px-3 pb-1 pt-5 text-sm text-muted-foreground">Management</p>
          {management.map(e => <Row key={e.name} entry={e} pathname={pathname} />)}
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
        <Link to="/dashboard" className="brand truncate text-lg font-semibold">{businessName}</Link>
        <div className="flex items-center gap-1"><CommandPalette variant="icon" shortcut={false} /><Button variant="ghost" size="icon" aria-label="Open menu" title="Menu" onClick={() => setMore(true)}><Menu /></Button></div>
      </header>

      <div className="min-w-0 pb-24 lg:pb-0">{children}</div>

      {pathname === '/dashboard' && <Link to="/sales" search={{ new: '1' }} className="fixed bottom-20 right-4 z-30 flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg lg:hidden"><Plus className="size-4" />New sale</Link>}

      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        {bottomTabs.map(item => {
          const active = isActive(pathname, item.to);
          return <Link key={item.to} to={item.to} aria-current={active ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${active ? 'font-semibold text-primary' : 'text-muted-foreground'}`}><item.icon className="size-5" />{item.name}</Link>;
        })}
        <button type="button" onClick={() => setMore(true)} className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"><Menu className="size-5" />More</button>
      </nav>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader><SheetTitle>{businessName}</SheetTitle></SheetHeader>
          <div className="grid gap-1 p-4 pt-0">
            {flat.map(item => <Link key={item.to + item.name} to={item.to} onClick={() => setMore(false)} aria-current={isActive(pathname, item.to) ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${isActive(pathname, item.to) ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-secondary'}`}><item.icon className="size-4" />{item.name}</Link>)}
            <Button className="mt-2 justify-start" variant="outline" onClick={() => { setMore(false); signOut(); }}><LogOut className="size-4" />Sign out</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
