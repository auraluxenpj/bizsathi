import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Banknote, Building2, Calculator, ChevronRight, LogOut, MessageSquareText, ShieldCheck, ShoppingCart, ArrowLeftRight, BarChart3, UserCog, UsersRound, Upload, Wallet, type LucideIcon } from 'lucide-react';
import { listBusinesses } from '@/lib/business.functions';
import { supabase } from '@/integrations/supabase/client';

type Item = { to: string; label: string; icon: LucideIcon; badge?: string };
const main: Item[] = [
  { to: '/businesses', label: 'Business Profile', icon: Building2 },
  { to: '/credit-reminder', label: 'Credit Reminder', icon: MessageSquareText, badge: 'New' },
  { to: '/businesses', label: 'Manage Staff', icon: UsersRound },
  { to: '/cash-bank', label: 'Cash & Bank Accounts', icon: Banknote },
  { to: '/reports', label: 'View Reports', icon: BarChart3 },
  { to: '/profile', label: 'Account Settings', icon: UserCog },
];
const utilities: Item[] = [
  { to: '/contacts', label: 'Import Parties', icon: Upload },
  { to: '/products', label: 'Import Items', icon: Upload },
  { to: '/calculators', label: 'Calculators', icon: Calculator },
  { to: '/pos', label: 'Quick POS', icon: ShoppingCart },
  { to: '/expenses', label: 'Expenses', icon: Wallet },
  { to: '/inventory', label: 'Stock Ledger', icon: ArrowLeftRight },
  { to: '/cash-counters', label: 'Cash Counters', icon: Banknote },
];
const adminOnly: Item[] = [{ to: '/security', label: 'Security Findings', icon: ShieldCheck }];

function Group({ title, items }: { title?: string; items: Item[] }) {
  return <section className="mt-6">{title && <h2 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h2>}
    <ul className="divide-y rounded-2xl border bg-card">{items.map(i => <li key={i.label}><Link to={i.to} className="flex min-h-14 items-center gap-4 px-4 py-3 text-base hover:bg-secondary/50"><i.icon className="size-5 text-muted-foreground" /><span className="flex-1">{i.label}</span>{i.badge && <span className="rounded bg-rose-500 px-1.5 py-0.5 text-xs font-medium text-white">{i.badge}</span>}<ChevronRight className="size-5 text-muted-foreground" /></Link></li>)}</ul></section>;
}

export function MoreMenu() {
  const load = useServerFn(listBusinesses); const client = useQueryClient(); const navigate = useNavigate();
  const businesses = useQuery({ queryKey: ['businesses'], queryFn: () => load() });
  const business = businesses.data?.[0];
  // Same rule as the sidebar: administrator-only links appear for owners and admins.
  const admin = businesses.data?.some(b => b.role === 'owner' || b.role === 'admin');
  async function signOut() { await client.cancelQueries(); client.clear(); await supabase.auth.signOut(); await navigate({ to: '/auth', replace: true }); }
  return <main className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-7">
    <div className="flex items-center gap-4"><span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary"><Building2 className="size-7" /></span><div className="min-w-0"><h1 className="truncate text-xl font-bold">{business?.name ?? 'BizSathi'}</h1><p className="text-sm capitalize text-muted-foreground">{business?.role ?? ''}</p></div></div>
    <Group items={main} />
    <Group title="Utilities" items={[...utilities, ...(admin ? adminOnly : [])]} />
    <section className="mt-6"><h2 className="mb-2 text-sm font-medium text-muted-foreground">Others</h2><button type="button" onClick={signOut} className="flex min-h-14 w-full items-center gap-4 rounded-2xl border bg-card px-4 py-3 text-base hover:bg-secondary/50"><LogOut className="size-5 text-muted-foreground" />Sign out</button></section>
  </main>;
}
