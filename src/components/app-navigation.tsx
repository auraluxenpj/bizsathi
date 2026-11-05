import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { LayoutDashboard, Receipt, ShoppingBag, Package, UsersRound, Wallet, BarChart3, Settings, ShoppingCart, Banknote, ArrowLeftRight, ShieldCheck, History, UserRound, LogOut, Plus, Menu, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { listBusinesses } from '@/lib/business.functions';
import { supabase } from '@/integrations/supabase/client';

type NavItem = { to: string; name: string; icon: LucideIcon };

const primary: NavItem[] = [
  { to: '/dashboard', name: 'Dashboard', icon: LayoutDashboard },
  { to: '/sales', name: 'Sales', icon: Receipt },
  { to: '/purchases', name: 'Purchases', icon: ShoppingBag },
  { to: '/products', name: 'Items', icon: Package },
  { to: '/contacts', name: 'Parties', icon: UsersRound },
  { to: '/expenses', name: 'Expenses', icon: Wallet },
  { to: '/accounting', name: 'Reports', icon: BarChart3 },
  { to: '/businesses', name: 'Settings', icon: Settings },
];
const tools: NavItem[] = [
  { to: '/pos', name: 'Point of sale', icon: ShoppingCart },
  { to: '/cash-counters', name: 'Cash counters', icon: Banknote },
  { to: '/inventory', name: 'Stock ledger', icon: ArrowLeftRight },
];
const adminTools: NavItem[] = [
  { to: '/security', name: 'Security findings', icon: ShieldCheck },
  { to: '/security-history', name: 'Review history', icon: History },
];
const account: NavItem = { to: '/profile', name: 'My account', icon: UserRound };
const bottomTabs = ['/dashboard', '/sales', '/products', '/contacts'];

const isActive = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active = isActive(pathname, item.to);
  return (
    <Link to={item.to} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-secondary'}`}>
      <item.icon className="size-4 shrink-0" />{item.name}
    </Link>
  );
}

export function AppNavigation({ children, pathname }: { children: ReactNode; pathname: string }) {
  const load = useServerFn(listBusinesses); const client = useQueryClient(); const navigate = useNavigate();
  const [more, setMore] = useState(false);
  const businesses = useQuery({ queryKey: ['businesses'], queryFn: () => load() });
  // Same rule as before: administrator-only links appear for owners and admins.
  const admin = businesses.data?.some(b => b.role === 'owner' || b.role === 'admin');
  const extra = [...tools, ...(admin ? adminTools : []), account];
  async function signOut() { await client.cancelQueries(); client.clear(); await supabase.auth.signOut(); await navigate({ to: '/auth', replace: true }); }

  return (
    <div className="min-h-screen bg-background lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card lg:flex">
        <Link to="/dashboard" className="brand border-b px-6 py-6 text-xl font-semibold">BizSathi<span className="text-primary">.</span><span className="mt-1 block text-xs font-normal text-muted-foreground">NEPAL</span></Link>
        <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto p-3">
          {primary.map(item => <NavLink key={item.to} item={item} pathname={pathname} />)}
          <p className="px-3 pb-1 pt-5 text-xs font-semibold text-muted-foreground">MORE</p>
          {extra.map(item => <NavLink key={item.to} item={item} pathname={pathname} />)}
        </nav>
        <div className="border-t p-3"><Button className="w-full justify-start" variant="ghost" onClick={signOut}><LogOut className="size-4" />Sign out</Button></div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-card px-4 py-3 lg:hidden">
        <Link to="/dashboard" className="brand text-lg font-semibold">BizSathi<span className="text-primary">.</span></Link>
        <Button variant="ghost" size="icon" title="Menu" aria-label="Open menu" onClick={() => setMore(true)}><Menu /></Button>
      </header>

      <div className="min-w-0 pb-24 lg:pb-0">{children}</div>

      {pathname === '/dashboard' && <Link to="/sales" search={{ new: '1' }} className="fixed bottom-20 right-4 z-30 flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg lg:hidden"><Plus className="size-4" />New sale</Link>}

      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        {primary.filter(i => bottomTabs.includes(i.to)).map(item => {
          const active = isActive(pathname, item.to);
          return <Link key={item.to} to={item.to} aria-current={active ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${active ? 'font-semibold text-primary' : 'text-muted-foreground'}`}><item.icon className="size-5" />{item.name}</Link>;
        })}
        <button type="button" onClick={() => setMore(true)} className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"><Menu className="size-5" />More</button>
      </nav>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader><SheetTitle>Menu</SheetTitle></SheetHeader>
          <div className="grid gap-1 p-4 pt-0">
            {[...primary, ...extra].map(item => <NavLink key={item.to} item={item} pathname={pathname} onNavigate={() => setMore(false)} />)}
            <Button className="mt-2 justify-start" variant="outline" onClick={() => { setMore(false); signOut(); }}><LogOut className="size-4" />Sign out</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
