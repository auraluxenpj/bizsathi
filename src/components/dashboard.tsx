import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, BarChart3, Building2, Calculator, Eye, Landmark, MessageSquareText, Package, Plus, Receipt, ShoppingCart, Tag, UserPlus, Wallet, Zap, type LucideIcon } from 'lucide-react';
import Decimal from 'decimal.js';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getBusinessAccess, listBusinesses } from '@/lib/business.functions';
import { authorizedSelection } from '@/lib/dashboard-data';
import { LowStockSummary, useLowStock } from './low-stock-summary';
import { getCommerce } from '@/lib/commerce.functions';
import { commerceTotals } from '@/lib/commerce-totals';
import { addDaysAd, bsMonthInfo, bsShort, compactNPR, formatBsAd, formatNPR, todayAd } from '@/lib/format';
import { supabase } from '@/integrations/supabase/client';
import { getStoredLanguage, setStoredLanguage, t, type Locale } from '@/lib/i18n';

const selectClass = 'mt-1 h-10 w-full rounded-md border bg-card px-3 text-sm text-foreground';

function StatCard({ label, value, icon: Icon, tint, iconTone, to, locale }: { label: string; value: string; icon: LucideIcon; tint: string; iconTone: string; to?: string; locale: Locale }) {
  const body = <><Icon className={`size-4 ${iconTone}`} /><p className="mt-4 text-xs text-foreground/70">{label}</p><p className="mt-1 break-words text-lg font-semibold tabular-nums sm:text-xl">{value}</p></>;
  const cls = `min-w-0 rounded-xl p-4 ${tint}`;
  return to ? <Link to={to} className={`${cls} block transition-opacity hover:opacity-80`}>{body}</Link> : <article className={cls}>{body}</article>;
}

export function Dashboard() {
  const list = useServerFn(listBusinesses); const getAccess = useServerFn(getBusinessAccess);
  const businesses = useQuery({ queryKey: ['businesses'], queryFn: () => list() });
  const [selected, setSelected] = useState(''); const [branch, setBranch] = useState('');
  const [privacy, setPrivacy] = useState(false); const [person, setPerson] = useState('');
  const [range, setRange] = useState<'day' | 'month'>('day');
  const [locale, setLocaleState] = useState<Locale>('en');
  const [userId, setUserId] = useState<string | null>(null);
  const businessId = authorizedSelection(businesses.data ?? [], selected);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      setLocaleState(getStoredLanguage(uid));
      const u = data.user;
      setPerson((u?.user_metadata?.['full_name'] as string | undefined) || u?.email?.split('@')[0] || '');
    });
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') setStoredLanguage(locale, userId ?? undefined);
  }, [locale, userId]);

  const access = useQuery({ queryKey: ['business-access', businessId], queryFn: () => getAccess({ data: { businessId } }), enabled: Boolean(businessId) });
  const branches = access.data?.branches.filter(b => b.is_active) ?? [];
  const branchId = branches.some(b => b.id === branch) ? branch : '';
  const loadCommerce = useServerFn(getCommerce);
  const commerce = useQuery({ queryKey: ['commerce', businessId], queryFn: () => loadCommerce({ data: { businessId } }), enabled: !!businessId });
  const lowStock = useLowStock(businessId, branches, branchId);
  const business = businesses.data?.find(b => b.id === businessId);
  const today = todayAd();
  const month = bsMonthInfo(today);
  const money = (v: number | null | undefined) => (privacy ? 'Rs. ••••' : formatNPR(v));

  const d = commerce.data;
  const monthly = d && month ? commerceTotals(d, branchId, month.fromAd, month.toAd) : null;
  const allTime = d ? commerceTotals(d, branchId, '0000-01-01', '9999-12-31') : null;
  const expenses = d && month ? d.journals.filter(j => (!branchId || j.branch_id === branchId) && j.account_code.startsWith('expense') && j.entry_date >= month.fromAd && j.entry_date <= month.toAd).reduce((s, j) => s + Number(j.debit), 0) : 0;
  const todaySales = d ? d.documents.filter(x => x.status === 'confirmed' && (!branchId || x.branch_id === branchId) && x.document_date === today && (x.kind === 'sale' || x.kind === 'sale_return')).reduce((sum, x) => sum + ((x.kind === 'sale') ? Number(x.total) : -Number(x.total)), 0) : 0;
  const todayExpenseTotal = d ? d.journals.filter(j => (!branchId || j.branch_id === branchId) && j.entry_date === today && j.account_code.startsWith('expense')).reduce((s, j) => s + Number(j.debit), 0) : 0;
  const cashBalance = allTime?.cash ?? 0;
  const customerOutstanding = allTime?.receivables ?? 0;
  const supplierOutstanding = allTime?.payables ?? 0;
  const currentSummary = range === 'day' ? { sales: todaySales, expenses: todayExpenseTotal, cash: cashBalance, receivables: customerOutstanding, payables: supplierOutstanding } : { sales: monthly?.sales ?? 0, expenses: expenses, cash: cashBalance, receivables: customerOutstanding, payables: supplierOutstanding };
  const recent = d?.documents.filter(x => x.status === 'confirmed' && (!branchId || x.branch_id === branchId)).slice(0, 6) ?? [];
  const monthName = month?.name ?? 'This month';

  return <main className="mx-auto max-w-7xl px-4 py-5 md:px-8 md:py-7">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{t(locale, 'Welcome')}{person ? ` ${person}` : ''}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{formatBsAd(today)}{business ? ` · ${business.name}` : ''}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border bg-card p-1 text-sm">
          <button type="button" aria-pressed={range === 'day'} onClick={() => setRange('day')} className={`rounded-md px-3 py-1.5 ${range === 'day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{t(locale, 'Daily')}</button>
          <button type="button" aria-pressed={range === 'month'} onClick={() => setRange('month')} className={`rounded-md px-3 py-1.5 ${range === 'month' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{t(locale, 'Monthly')}</button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocaleState(prev => prev === 'en' ? 'ne' : 'en')} className="gap-2"><span>{locale === 'en' ? 'नेपाली' : 'English'}</span></Button>
        <Button asChild variant="outline" className="relative h-10 border-primary/30 bg-primary/10 text-foreground hover:bg-primary/20"><Link to="/pos"><Zap className="size-4" />{t(locale, 'Quick POS')}</Link></Button>
        <Button asChild className="h-10"><Link to="/sales" search={{ new: '1' }}><Plus className="size-4" />{t(locale, 'New Sale')}</Link></Button>
      </div>
    </header>

    {(businesses.isPending || (businessId && access.isPending)) && <p role="status" className="py-6 text-sm">{t(locale, 'Loading your workspace…')}</p>}
    {(businesses.data?.length ?? 0) > 1 || branches.length > 1 ? <div className="mt-4 grid gap-3 sm:grid-cols-2 md:max-w-xl">
      <label className="text-xs text-muted-foreground">{t(locale, 'Business')}<select aria-label="Dashboard business" className={selectClass} disabled={!businesses.data?.length} value={businessId} onChange={e => setSelected(e.target.value)}>{(businesses.data ?? []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="text-xs text-muted-foreground">{t(locale, 'Branch')}<select aria-label="Dashboard branch" className={selectClass} disabled={!branches.length} value={branchId} onChange={e => setBranch(e.target.value)}>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    </div> : null}
    {!businesses.isPending && !businesses.error && !businessId && <section className="my-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-secondary/40 p-5"><div><h2 className="text-lg font-semibold">{t(locale, 'No business linked yet')}</h2></div><Button asChild variant="outline"><Link to="/businesses">{t(locale, 'Business profile')}</Link></Button></section>}
    {commerce.error && <p role="alert" className="mt-4 text-sm text-destructive">{commerce.error.message}</p>}

    <section aria-label="Summary" className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatCard locale={locale} label={range === 'day' ? t(locale, 'Today sales') : `${t(locale, 'Sales')} (${t(locale, monthName)})`} value={money(currentSummary.sales)} icon={Tag} tint="bg-emerald-50" iconTone="text-emerald-600" to="/sales" />
      <StatCard locale={locale} label={range === 'day' ? t(locale, 'Today expenses') : `${t(locale, 'Expenses')} (${t(locale, monthName)})`} value={money(currentSummary.expenses)} icon={Wallet} tint="bg-rose-50" iconTone="text-rose-600" to="/expenses" />
      <StatCard locale={locale} label={t(locale, 'Gross profit')} value={t(locale, 'Not available')} icon={ArrowUp} tint="bg-violet-50" iconTone="text-violet-600" to="/reports" />
      <StatCard locale={locale} label={t(locale, 'Cash and bank balance')} value={money(currentSummary.cash)} icon={Landmark} tint="bg-blue-50" iconTone="text-blue-600" to="/cash-bank" />
      <StatCard locale={locale} label={t(locale, 'Customer outstanding')} value={money(currentSummary.receivables)} icon={ArrowDown} tint="bg-emerald-50" iconTone="text-emerald-600" to="/parties" />
      <StatCard locale={locale} label={t(locale, 'Supplier outstanding')} value={money(currentSummary.payables)} icon={ArrowUp} tint="bg-rose-50" iconTone="text-rose-600" to="/parties" />
    </section>
    <p className="mt-2 text-xs text-muted-foreground">{t(locale, 'Gross profit is unavailable until cost of goods sold can be calculated from verified inventory costs.')}</p>

    <section aria-label="Quick actions" className="mt-6">
      <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-semibold">{t(locale, 'Quick actions')}</h2><span className="text-xs text-muted-foreground">{t(locale, 'Approximate based on current ledger records')}</span></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[{ to: '/sales', label: 'New Sale', icon: Tag, search: { new: '1' } }, { to: '/purchases', label: 'New Purchase', icon: ShoppingCart, search: { new: '1' } }, { to: '/expenses', label: 'Add Expense', icon: Wallet }, { to: '/contacts', label: 'Add Customer', icon: UserPlus }, { to: '/products', label: 'Add Stock', icon: Package }, { to: '/reports', label: 'View Reports', icon: BarChart3 }].map(item => <Link key={item.label} to={item.to} search={item.search ?? {}} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-3 text-center text-sm font-medium shadow-sm transition-colors hover:bg-secondary">
          <item.icon className="size-5 text-primary" />
          <span>{t(locale, item.label)}</span>
        </Link>)}
      </div>
    </section>

    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <section aria-label="Cashflow" className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{t(locale, 'Cash and bank balance')}</h2><span className="text-sm font-normal text-muted-foreground">{range === 'day' ? t(locale, 'Today') : t(locale, 'This month')}</span></div>
          <p className="mt-3 text-3xl font-semibold tabular-nums">{money(cashBalance)}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t(locale, 'All business figures are approximate until the ledger is reconciled')}</p>
        </section>
      </div>
      <div className="space-y-5">
        <section className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">{t(locale, 'Low stock alerts')}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{lowStock.inventory.isLoading ? '…' : lowStock.inventory.items.length}</p><LowStockSummary businessId={businessId} branches={branches} branchId={branchId} /></section>
        <section className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">{t(locale, 'Recent transactions')}</h2>{recent.length ? <ul className="mt-3 space-y-2 text-sm">{recent.map(x => <li key={x.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0 last:pb-0"> <span className="min-w-0"> <span className="block truncate">{x.reference || x.kind}</span><span className="block text-xs text-muted-foreground">{formatBsAd(x.document_date)}</span></span><span className="shrink-0 font-medium tabular-nums">{money(Number(x.total))}</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">{t(locale, 'No transactions')}</p>}</section>
      </div>
    </div>
  </main>;
}
