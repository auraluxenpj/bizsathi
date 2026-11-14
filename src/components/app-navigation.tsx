import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Building2, ChevronDown, PanelLeftClose, PanelLeftOpen, Menu, LogOut, MoreHorizontal, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { CommandPalette } from '@/components/command-palette';
import { WorkspaceSidebar } from '@/components/workspace-sidebar';
import { listBusinesses } from '@/lib/business.functions';
import { supabase } from '@/integrations/supabase/client';
import { useCan } from './permission-checklist';
import { routePermission } from '@/lib/permissions';
import { workspaceGroups, workspaceItemActive } from '@/lib/workspace-navigation';
import { validateReportSearch } from '@/lib/report-filters';

export function AppNavigation({ children, pathname }: { children: ReactNode; pathname: string }) {
 const load = useServerFn(listBusinesses); const client = useQueryClient(); const navigate = useNavigate(); const search = useSearch({ strict: false });
 const [person, setPerson] = useState(''); const [compact, setCompact] = useState(false); const [mobileOpen, setMobileOpen] = useState(false);
 const businesses = useQuery({ queryKey: ['businesses'], queryFn: () => load() });
 const admin = businesses.data?.some(b => b.role === 'owner' || b.role === 'admin');
 const can = useCan(businesses.data?.[0]?.id ?? '');
 const visible = (to?: string) => { const permission = to ? routePermission[to] : undefined; return !permission || can(permission); };
 const deniedPage = Object.keys(routePermission).some(r => (pathname === r || pathname.startsWith(`${r}/`)) && !visible(r));
 const businessName = businesses.data?.[0]?.name ?? 'BizSathi';
 const current = workspaceGroups.flatMap(g => g.items).find(i => workspaceItemActive(i, pathname, search));
 const title = pathname === '/dashboard' ? 'Dashboard' : current?.name ?? pathname.slice(1).replaceAll('-', ' ').replace(/^./, c => c.toUpperCase());
 useEffect(() => { supabase.auth.getUser().then(({ data }) => { const u = data.user; setPerson((u?.user_metadata?.['full_name'] as string | undefined) || u?.email?.split('@')[0] || ''); }); try { setCompact(localStorage.getItem('bizsathi.sidebar.compact') === 'true'); } catch {} }, []);
 useEffect(() => { setMobileOpen(false); }, [pathname, search]);
 function toggleCompact() { setCompact(prev => { const next = !prev; try { localStorage.setItem('bizsathi.sidebar.compact', String(next)); } catch {} return next; }); }
 async function signOut() { await client.cancelQueries(); client.clear(); await supabase.auth.signOut(); await navigate({ to: '/auth', replace: true }); }
 const extras = [
  { name: 'Quotations / estimates', to: '/quotations' }, { name: 'Transactions', to: '/transactions' }, { name: 'Parties & payments', to: '/parties' },
  { name: 'All reports', to: '/reports' }, { name: 'Stock ledger', to: '/inventory' }, { name: 'Credit reminder', to: '/credit-reminder' },
  { name: 'Calculators', to: '/calculators' }, { name: 'Notebook', to: '/notebook' }, { name: 'Bill gallery', to: '/bill-gallery' }, { name: 'Scan receipts', to: '/expense-receipts' },
  ...(admin ? [{ name: 'Security findings', to: '/security' }, { name: 'Review history', to: '/security-history' }] : []), { name: 'My account', to: '/profile' }, { name: 'More tools', to: '/more' },
 ];
 const workspaceMenu = <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More workspace pages" title="More workspace pages"><MoreHorizontal className="size-5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="max-h-[70dvh] overflow-y-auto">{extras.filter(i => visible(i.to)).map(i => <DropdownMenuItem key={i.to} asChild><Link to={i.to} search={['/reports', '/transactions'].includes(i.to) ? validateReportSearch(search) : {}}>{i.name}</Link></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
 return <div className={`min-h-screen bg-workspace ${compact ? 'lg:pl-[72px]' : 'lg:pl-[272px]'}`}>
  <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar lg:flex ${compact ? 'w-[72px]' : 'w-[272px]'}`}>
   <Link to="/dashboard" title={businessName} className={`flex h-20 shrink-0 items-center gap-3 ${compact ? 'justify-center px-3' : 'px-5'}`}><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Building2 className="size-5" /></span>{!compact && <span className="min-w-0"><span className="block truncate text-sm font-bold text-sidebar-foreground">{businessName}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">BizSathi Nepal</span></span>}</Link>
   <WorkspaceSidebar pathname={pathname} search={search} compact={compact} visible={visible} />
   <div className="flex h-14 shrink-0 items-center justify-center border-t border-sidebar-border"><Button variant="ghost" onClick={toggleCompact} size={compact ? 'icon' : 'default'} className="gap-2 text-muted-foreground" aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'} title={compact ? 'Expand sidebar' : 'Collapse sidebar'}>{compact ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" />Collapse</>}</Button></div>
  </aside>
  <header className="sticky top-0 z-20 flex h-16 min-w-0 items-center gap-2 border-b bg-card px-3 sm:gap-4 sm:px-6">
   <Button variant="ghost" size="icon" aria-label="Open navigation menu" title="Navigation menu" className="shrink-0 lg:hidden" onClick={() => setMobileOpen(true)}><Menu className="size-5" /></Button>
   <span className="min-w-0 flex-1 truncate text-base font-semibold sm:text-xl">{title}</span>
   <div className="hidden xl:block"><CommandPalette className="w-64" /></div><div className="xl:hidden"><CommandPalette variant="icon" /></div>
   <Button asChild variant="outline" className="hidden h-9 sm:inline-flex"><Link to="/purchases" search={{ new: '1' }}><Plus className="size-4" />Purchase</Link></Button>
   <Button asChild className="hidden h-9 sm:inline-flex"><Link to="/sales" search={{ new: '1' }}><Plus className="size-4" />Sale</Link></Button>
   {workspaceMenu}
   <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="gap-2 px-1 sm:px-2" aria-label="Account menu"><span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary">{person.slice(0, 1) || 'A'}</span><span className="hidden max-w-24 truncate text-xs font-medium md:block">{person}</span><ChevronDown className="hidden size-3 md:block" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to="/profile">My account</Link></DropdownMenuItem><DropdownMenuItem onSelect={signOut}><LogOut className="size-4" />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  </header>
  <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="flex w-[min(320px,90vw)] flex-col bg-sidebar p-0"><div className="px-5 pb-5 pt-7"><SheetTitle>{businessName}</SheetTitle><SheetDescription>BizSathi Nepal</SheetDescription></div><WorkspaceSidebar pathname={pathname} search={search} visible={visible} onNavigate={() => setMobileOpen(false)} /></SheetContent></Sheet>
  <div className="min-w-0">{deniedPage ? <main className="mx-auto max-w-xl px-5 py-16 text-center"><h1 className="brand text-2xl">No access</h1><p className="mt-3 text-sm text-muted-foreground">Your administrator has turned off access to this page.</p></main> : children}</div>
 </div>;
}
