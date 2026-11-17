import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Building2, ChevronDown, PanelLeftClose, PanelLeftOpen, Menu, LogOut, MoreHorizontal, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useApplyAppearance } from '@/components/appearance-settings';
import { MobileTabBar } from '@/components/mobile-tab-bar';
import { CommandPalette } from '@/components/command-palette';
import { WorkspaceSidebar } from '@/components/workspace-sidebar';
import { listBusinesses } from '@/lib/business.functions';
import { supabase } from '@/integrations/supabase/client';
import { useCan, usePermissionDenials } from './permission-checklist';
import { permissionForRoute } from '@/lib/permissions';
import { isBillingStaff, shouldRedirectBillingStaff, workspaceGroups, workspaceItemActive } from '@/lib/workspace-navigation';
import { validateReportSearch } from '@/lib/report-filters';
import { dashboardKind } from '@/lib/dashboard-profile';

export function AppNavigation({ children, pathname }: { children: ReactNode; pathname: string }) {
 useApplyAppearance(); const load = useServerFn(listBusinesses); const client = useQueryClient(); const navigate = useNavigate(); const search = useSearch({ strict: false });
 const [person, setPerson] = useState(''); const [avatar, setAvatar] = useState(''); const [compact, setCompact] = useState(false); const [mobileOpen, setMobileOpen] = useState(false);
 const businesses = useQuery({ queryKey: ['businesses'], queryFn: () => load() });
 const businessId = businesses.data?.[0]?.id ?? '';
 // listBusinesses verifies platform ownership server-side. The Master Owner must never be
 // filtered by employee/business role permissions or hidden route catalogue entries.
 const platformOwner = businesses.data?.some(b => b.isPlatformOwner) ?? false;
 const permissionsQuery = usePermissionDenials(businessId);
 const permissionsReady = permissionsQuery.isSuccess;
 const can = useCan(businessId);
 const admin = platformOwner || businesses.data?.some(b => (b.effectiveRank ?? (b.role === 'owner' || b.role === 'admin' ? 100 : 0)) >= 80);
 const billingStaff = isBillingStaff(can);
 const kind = dashboardKind(can);
 const permitted = (to?: string, routeSearch?: Record<string, unknown>) => {
  if (platformOwner) return true;
  const permission = to ? permissionForRoute(to, routeSearch ?? search) : undefined;
  return !permission || can(permission);
 };
 // POS-only employees see only the terminal. Platform Owner bypasses all employee route filters.
 const visible = (to?: string, routeSearch?: Record<string, unknown>) => {
  if (platformOwner) return true;
  if (billingStaff && to !== '/pos') return false;
  return permitted(to, routeSearch) && (!['/security', '/security-history'].includes(to ?? '') || !!admin);
 };
 const activeRoutePermission = permissionForRoute(pathname, search);
 const adminOnlyRoute = ['/security','/security-history'].some(route => pathname === route || pathname.startsWith(`${route}/`));
 const deniedPage = !platformOwner && (permissionsQuery.isPending || permissionsQuery.isError || (permissionsReady && ((billingStaff && pathname !== '/pos') || (adminOnlyRoute && !admin) || (!!activeRoutePermission && !can(activeRoutePermission)))));
 const businessName = businesses.data?.[0]?.name ?? 'BizSathi';
 const current = workspaceGroups.flatMap(g => g.items).find(i => workspaceItemActive(i, pathname, search));
 const title = pathname === '/dashboard' ? 'Dashboard' : current?.name ?? pathname.slice(1).replaceAll('-', ' ').replace(/^./, c => c.toUpperCase());
 useEffect(() => { let active = true; supabase.auth.getUser().then(async ({ data }) => { const u = data.user; if (!u) return; let profile: { full_name: string | null; avatar_url: string | null } | null = null; if (typeof supabase.from === 'function') { const result = await supabase.from('profiles').select('full_name,avatar_url').eq('id', u.id).maybeSingle(); profile = result.data; } if (!active) return; setPerson(profile?.full_name || (u.user_metadata?.['full_name'] as string | undefined) || u.email?.split('@')[0] || ''); const path = profile?.avatar_url || ''; if (path.startsWith('http')) setAvatar(path); else if (path && supabase.storage) { const { data: signed } = await supabase.storage.from('avatars').createSignedUrl(path, 60 * 60); if (active) setAvatar(signed?.signedUrl || ''); } }); try { setCompact(localStorage.getItem('bizsathi.sidebar.compact') === 'true'); } catch { /* Local storage can be unavailable in restricted browser contexts. */ } return () => { active = false; }; }, []);
 useEffect(() => { setMobileOpen(false); }, [pathname, search]);
 useEffect(() => { if (permissionsReady && billingStaff && shouldRedirectBillingStaff(pathname)) void navigate({ to: '/pos', replace: true }); }, [permissionsReady, billingStaff, pathname, navigate]);
 function toggleCompact() { setCompact(prev => { const next = !prev; try { localStorage.setItem('bizsathi.sidebar.compact', String(next)); } catch { /* Keep the in-memory preference when local storage is unavailable. */ } return next; }); }
 async function signOut() { await client.cancelQueries(); client.clear(); await supabase.auth.signOut(); await navigate({ to: '/auth', replace: true }); }
 if (businesses.isPending) return <main className="flex min-h-screen items-center justify-center px-6 text-sm text-muted-foreground" role="status">Checking AURALUXE workspace access…</main>;
 if (businesses.error) return <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center"><h1 className="brand text-2xl">Workspace access could not be verified</h1><p role="alert" className="mt-3 text-sm text-muted-foreground">{businesses.error.message}</p><Button className="mt-5" onClick={() => client.invalidateQueries({ queryKey: ['businesses'] })}>Try again</Button></main>;
 // Platform owners may retain legacy business records; the app opens the first active business returned by the name-ordered server query.
 if (!businesses.data?.length) return <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center"><Building2 className="size-10 text-primary" /><h1 className="brand mt-5 text-2xl">AURALUXE access required</h1><p className="mt-3 text-sm text-muted-foreground">Your account is not linked to the AURALUXE workspace yet. Ask an AURALUXE administrator for a staff invitation, then sign in again after accepting it.</p><Button variant="outline" className="mt-5" onClick={signOut}>Sign out</Button></main>;
 if (permissionsReady && billingStaff && shouldRedirectBillingStaff(pathname)) return <main className="flex min-h-screen items-center justify-center px-6 text-sm text-muted-foreground" role="status">Opening billing workspace…</main>;
 const extras = [
  { name: 'Quotations / estimates', to: '/quotations' }, { name: 'Transactions', to: '/transactions' }, { name: 'All reports', to: '/reports' }, { name: 'Stock ledger', to: '/inventory' }, { name: 'Credit reminder', to: '/credit-reminder' },
  { name: 'Calculators', to: '/calculators' }, { name: 'Notebook', to: '/notebook' }, { name: 'Bill gallery', to: '/bill-gallery' }, { name: 'Scan receipts', to: '/expense-receipts' },
  ...(admin ? [{ name: 'Security findings', to: '/security' }, { name: 'Review history', to: '/security-history' }] : []), { name: 'How to use BizSathi', to: '/help' }, { name: 'My account', to: '/profile' }, { name: 'More tools', to: '/more' },
 ];
 const menuItems = extras.filter(i => visible(i.to));
 const workspaceMenu = !menuItems.length ? null : <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More workspace pages" title="More workspace pages" className="size-10 shrink-0"><MoreHorizontal className="size-5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="max-h-[70dvh] overflow-y-auto">{menuItems.map(i => <DropdownMenuItem key={i.to} asChild><Link to={i.to} search={['/reports', '/transactions'].includes(i.to) ? validateReportSearch(search) : {}}>{i.name}</Link></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
 return <div data-sidebar-compact={compact ? 'true' : 'false'} className={`app-workspace min-h-screen bg-workspace ${compact ? 'lg:pl-[76px]' : 'lg:pl-[280px]'}`}>
  <aside className={`app-sidebar fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar lg:flex ${compact ? 'w-[76px]' : 'w-[280px]'}`}>
   <Link to="/dashboard" title={businessName} className={`app-sidebar-brand flex h-[84px] shrink-0 items-center gap-3 border-b border-sidebar-border ${compact ? 'justify-center px-3' : 'px-5'}`}><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Building2 className="size-5" /></span>{!compact && <span className="min-w-0"><span className="block truncate text-sm font-bold text-sidebar-foreground">{businessName}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">BizSathi Nepal</span></span>}</Link>
   <WorkspaceSidebar pathname={pathname} search={search} compact={compact} visible={visible} />
   <div className="flex h-14 shrink-0 items-center justify-center border-t border-sidebar-border"><Button variant="ghost" onClick={toggleCompact} size={compact ? 'icon' : 'default'} className="gap-2 text-muted-foreground" aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'} title={compact ? 'Expand sidebar' : 'Collapse sidebar'}>{compact ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" />Collapse</>}</Button></div>
  </aside>
  <header className="app-topbar sticky top-0 z-20 flex min-h-[68px] min-w-0 flex-wrap items-center gap-2 border-b bg-card/95 px-3 py-2 sm:gap-3 sm:px-6">
   <Button variant="ghost" size="icon" aria-label="Open navigation menu" title="Navigation menu" className="size-10 shrink-0 lg:hidden" onClick={() => setMobileOpen(true)}><Menu className="size-5" /></Button>
   <span className="min-w-0 flex-[1_1_9rem] truncate text-base font-semibold sm:text-xl">{title}</span>
   <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
    {!billingStaff && <><div className="hidden min-w-0 xl:block"><CommandPalette className="w-64 max-w-full" visible={visible} can={can} businessId={businesses.data?.[0]?.id ?? ''} /></div>
    <div className="xl:hidden"><CommandPalette variant="icon" shortcut={false} visible={visible} can={can} /></div></>}
    {!billingStaff && <>{can('purchases.create') && <Button asChild variant="outline" className="hidden h-10 shrink-0 sm:inline-flex"><Link to="/purchases" search={{ new: '1' }}><Plus className="size-4" />Purchase</Link></Button>}
    {can('sales.create') && <Button asChild className="hidden h-10 shrink-0 sm:inline-flex"><Link to="/sales" search={{ new: '1' }}><Plus className="size-4" />Sale</Link></Button>}</>}
    {workspaceMenu}
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-10 min-h-10 shrink-0 gap-2 px-1 sm:px-2" aria-label="Account menu"><span className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary">{avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : person.slice(0, 1) || 'A'}</span><span className="hidden max-w-24 truncate text-xs font-medium md:block">{person}</span><ChevronDown className="hidden size-3 md:block" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{!billingStaff && <DropdownMenuItem asChild><Link to="/profile">My account</Link></DropdownMenuItem>}<DropdownMenuItem onSelect={signOut}><LogOut className="size-4" />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
   </div>
  </header>
  <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="flex w-[min(320px,90vw)] flex-col bg-sidebar p-0"><div className="px-5 pb-5 pt-7"><SheetTitle>{businessName}</SheetTitle><SheetDescription>BizSathi Nepal</SheetDescription></div><WorkspaceSidebar pathname={pathname} search={search} visible={visible} onNavigate={() => setMobileOpen(false)} /></SheetContent></Sheet>
  <div className="min-w-0">{deniedPage ? <main className="mx-auto max-w-xl px-5 py-16 text-center"><h1 className="brand text-2xl">{permissionsQuery.isPending ? 'Checking access' : permissionsQuery.isError ? 'Access could not be verified' : 'No access'}</h1><p className="mt-3 text-sm text-muted-foreground">{permissionsQuery.isPending ? 'Checking your assigned business roles and permissions…' : permissionsQuery.isError ? 'Your permissions could not be verified. Refresh or contact your business administrator.' : 'Your administrator has not granted access to this page.'}</p></main> : children}</div>
  <MobileTabBar pathname={pathname} kind={kind} can={can} />
 </div>;
}
