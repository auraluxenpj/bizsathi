import { useEffect, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

/** A shortcut tile. `permission` is an extra checklist permission on top of the page's own route permission. */
export type DashboardAction = { to: string; label: string; icon: LucideIcon; search?: Record<string, string> | undefined; permission?: string | undefined };

export function StatCard({ label, value, icon: Icon, tone, to, subtitle }: { label: string; value: string; icon: LucideIcon; tone: string; to?: string | undefined; subtitle: string }) {
  const content = <><div className="flex items-center justify-between gap-2"><span className={`flex size-9 items-center justify-center rounded-md ${tone}`}><Icon className="size-4" /></span><ArrowUpRight className="size-3.5 text-muted-foreground" /></div><p className="stat-label mt-4 text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 break-words text-xl font-semibold tabular-nums">{value}</p><p className="mt-3 text-[11px] text-muted-foreground">{subtitle}</p></>;
  const cls = 'dashboard-stat-card group block min-w-0 rounded-2xl border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md';
  return to ? <Link to={to} className={cls}>{content}</Link> : <article className={cls}>{content}</article>;
}

export function usePersonName() {
  const [person, setPerson] = useState('');
  useEffect(() => { supabase.auth.getUser().then(({ data }) => { const u = data.user; setPerson((u?.user_metadata?.['full_name'] as string | undefined) || u?.email?.split('@')[0] || ''); }); }, []);
  return person;
}

/** Page frame shared by the role desks. Bottom padding keeps content clear of the mobile tab bar. */
export function DashboardShell({ title, icon: Icon, subtitle, children }: { title: string; icon: LucideIcon; subtitle: string; children: ReactNode }) {
  return <main className="dashboard-shell mx-auto max-w-[1600px] px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:pb-6 xl:px-10">
    <header className="dashboard-header rounded-2xl border bg-card px-5 py-5 shadow-sm sm:px-6"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span><h1 className="brand text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1></div><p className="mt-2 text-xs text-muted-foreground">{subtitle}</p></header>
    {children}
  </main>;
}

export function ActionGrid({ title, actions }: { title: string; actions: DashboardAction[] }) {
  if (!actions.length) return null;
  return <section aria-label={title} className="dashboard-quick-actions mt-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
    <h2 className="text-xs font-semibold text-muted-foreground">{title}</h2>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{actions.map(a => <Button asChild key={a.label} variant="outline" className="h-auto min-h-[4.5rem] flex-col gap-2 whitespace-normal bg-card py-3 text-center text-xs"><Link to={a.to} search={(a.search ?? {}) as never}><a.icon className="size-5" />{a.label}</Link></Button>)}</div>
  </section>;
}

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section aria-label={title} className="dashboard-panel min-w-0 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
    <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{title}</h2>{action}</div>
    {children}
  </section>;
}

export function Notice({ children }: { children: ReactNode }) {
  return <p role="status" className="mt-5 rounded-2xl border bg-card px-5 py-4 text-sm text-muted-foreground">{children}</p>;
}
