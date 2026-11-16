import { Link } from '@tanstack/react-router';
import { Bell, Building2, Calculator, ChevronDown, ChevronRight, ArrowDown, ArrowUp, EyeOff, FilePlus2, HandCoins, MessageSquareText, NotebookText, Package, PackagePlus, ReceiptText, ShoppingCart, Tag, Undo2, UserPlus, Wallet, Zap, BarChart3, Plus, type LucideIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

export type KarobarHomeProps = {
  businessName: string; periodName: string; period: string; onPeriodChange: (v: string) => void; privacy: boolean; onPrivacy: (v: boolean) => void;
  money: (v: number | null | undefined) => string; visible: (to: string) => boolean;
  receive?: number | null | undefined; give?: number | null | undefined; sales?: number | null | undefined;
  purchases?: number | null | undefined; expenses?: number | null | undefined; cashBank?: number | null | undefined;
  recent?: { id: string; reference: string; kind: string; document_date: string; total: number }[];
};
type Tile = { to: string; label: string; icon: LucideIcon; search?: Record<string, string>; badge?: string };

const explore: Tile[] = [
  { to: '/accounting', label: 'Quick Entry', icon: Calculator }, { to: '/pos', label: 'Quick POS', icon: Zap },
  { to: '/reports', label: 'View Reports', icon: BarChart3 }, { to: '/credit-reminder', label: 'Credit Reminder', icon: MessageSquareText, badge: 'New' },
];
const shortcuts: Tile[] = [
  { to: '/parties', label: 'Add Party', icon: UserPlus }, { to: '/sales', label: 'Sales Invoice', icon: Tag, search: { new: '1' } },
  { to: '/parties', label: 'Payment In', icon: HandCoins, search: { tab: 'receive' } }, { to: '/parties', label: 'Payment Out', icon: Wallet, search: { tab: 'give' } },
  { to: '/purchases', label: 'Purchase', icon: ShoppingCart, search: { new: '1' } }, { to: '/products', label: 'Add Item', icon: PackagePlus },
  { to: '/expenses', label: 'Expense', icon: ReceiptText }, { to: '/notebook', label: 'Add Note', icon: NotebookText },
  { to: '/sales', label: 'Sales Return', icon: Undo2, search: { new: '1', kind: 'sales_return' } },
];

function Stat({ to, value, label, tone }: { to?: string | undefined; value: string; label: React.ReactNode; tone?: 'receive' | 'give' }) {
  const cls = tone === 'receive' ? 'border-[#b9def3] bg-[#e7f4fc] text-[#1f9a6e]' : tone === 'give' ? 'border-[#f0b8c8] bg-[#fbe7ed] text-[#e2335f]' : 'border-transparent bg-white text-[#1b1f23]';
  const body = <><div className="min-w-0"><p className="truncate text-xl font-semibold leading-7 tabular-nums">{value}</p><p className={`mt-2 flex items-center gap-1 text-sm ${tone ? 'text-current/80' : 'text-[#6b7280]'}`}>{label}</p></div><ChevronRight className="size-5 shrink-0 text-[#6b7280]" /></>;
  const base = `flex min-w-0 items-center justify-between rounded-xl border px-4 py-4 shadow-[0_1px_4px_rgba(16,24,40,.06)] ${cls}`;
  return to ? <Link to={to} className={base}>{body}</Link> : <div className={base}>{body}</div>;
}
function Round({ t }: { t: Tile }) {
  return <Link to={t.to} search={(t.search ?? {}) as never} className="flex flex-col items-center gap-2 text-center"><span className="flex size-[54px] items-center justify-center rounded-2xl bg-[#E6EDFF] text-[#2347D9]"><t.icon className="size-6" /></span><span className="text-[15px] leading-tight text-[#1b1f23]">{t.label}</span></Link>;
}

export function KarobarHome(p: KarobarHomeProps) {
  const ok = (to: string) => p.visible(to);
  return <main className="karobar min-h-screen bg-[#f8f9fc] px-4 pb-28 pt-4 font-[Roboto,sans-serif]">
    <header className="flex items-center gap-3">
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#fdf8ea] text-[#b8860b]"><Building2 className="size-6" /></span>
      <Link to="/businesses" className="flex min-w-0 flex-1 items-center gap-2"><span className="truncate text-lg font-bold uppercase text-[#1b1f23]">{p.businessName}</span><ChevronDown className="size-5 shrink-0" /></Link>
      <Link to="/more" aria-label="Notifications" className="p-1"><Bell className="size-6" /></Link>
    </header>
    <label className="mt-4 flex items-center gap-4 rounded-xl bg-white px-5 py-4 text-[15px] text-[#1b1f23]"><EyeOff className="size-6 text-[#6b7280]" /><span className="flex-1">Privacy Mode</span><Switch checked={p.privacy} onCheckedChange={p.onPrivacy} aria-label="Privacy mode" /></label>
    <section aria-label="Dashboard period" className="mt-3 flex flex-wrap gap-2">
      {([['today', 'Today'], ['month', 'This month'], ['week', '7 days'], ['30', '30 days']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={p.period === id} onClick={() => p.onPeriodChange(id)} className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors ${p.period === id ? 'border-[#55aee8] bg-[#e7f4fc] text-[#2478a8]' : 'border-[#e5e7eb] bg-white text-[#6b7280]'}`}>{label}</button>)}
    </section>
    <section aria-label="Sales summary" className="mt-4">
      <div className="biz-sales-hero p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div><p className="biz-hero-label text-sm font-semibold">Sales · {p.periodName}</p><p className="biz-hero-value mt-2 tabular-nums">{p.money(p.sales)}</p></div>
          <span className="rounded-full bg-[#FFB41F] px-3 py-1 text-[10px] font-extrabold tracking-wide text-[#1B2559]">PRO</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/20 pt-4">
          <Link to="/parties" search={{tab:'receive'}} className="rounded-xl bg-white/10 p-3 text-white"><span className="block text-xs text-white/75">Received · To collect</span><span className="mt-1 block text-lg font-bold tabular-nums">{p.money(p.receive)}</span></Link>
          <Link to="/parties" search={{tab:'give'}} className="rounded-xl bg-white/10 p-3 text-white"><span className="block text-xs text-white/75">To pay</span><span className="mt-1 block text-lg font-bold tabular-nums">{p.money(p.give)}</span></Link>
        </div>
      </div>
      <div className="biz-quick-actions mt-4 grid grid-cols-3 gap-3">
        {ok('/sales') && <Link to="/sales" search={{new:'1'}} className="biz-quick-action biz-quick-action-new flex flex-col items-center justify-center gap-2 text-center"><Plus /><span>New Bill</span></Link>}
        {ok('/expenses') && <Link to="/expenses" className="biz-quick-action biz-quick-action-expense flex flex-col items-center justify-center gap-2 text-center"><ReceiptText /><span>Add Expense</span></Link>}
        {ok('/parties') && <Link to="/parties" search={{tab:'receive'}} className="biz-quick-action biz-quick-action-collect flex flex-col items-center justify-center gap-2 text-center"><HandCoins /><span>Collect Payment</span></Link>}
      </div>
    </section>
    <section aria-label="Other balances" className="mt-4 grid grid-cols-2 gap-3">
      <Stat to={ok('/purchases') ? '/purchases' : undefined} value={p.money(p.purchases)} label={`Purchase (${p.periodName})`} />
      <Stat to={ok('/expenses') ? '/expenses' : undefined} value={p.money(p.expenses)} label={`Expense (${p.periodName})`} />
      <Stat to={ok('/cash-bank') ? '/cash-bank' : undefined} value={p.money(p.cashBank)} label="Cash & Bank" />
    </section>
    <section aria-label="Recent activities" className="biz-surface mt-6 p-4">
      <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold text-[#1b1f23]">Recent activities</h2><Link to="/transactions" className="text-sm font-medium text-[#2478a8]">View all</Link></div>
      {p.recent?.length ? <ul className="mt-2 divide-y">{p.recent.slice(0, 4).map(item => <li key={item.id} className="flex min-w-0 items-center gap-3 py-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e7f4fc] text-[#2478a8]"><ReceiptText className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-[#1b1f23]">{item.reference}</span><span className="block text-xs capitalize text-[#6b7280]">{item.kind.replaceAll("_", " ")} · {item.document_date}</span></span><span className="shrink-0 text-sm font-semibold tabular-nums text-[#1b1f23]">{p.money(item.total)}</span></li>)}</ul> : <p className="py-5 text-center text-sm text-[#6b7280]">No confirmed activity recorded.</p>}
    </section>
    <h2 className="biz-section-title mt-7 text-xl">Explore App</h2>
    <section className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{explore.filter(t => ok(t.to)).map(t => <Link key={t.label} to={t.to} className="relative flex flex-col items-center gap-3 rounded-xl bg-white px-1 py-4 text-center shadow-[0_1px_4px_rgba(16,24,40,.06)]">{t.badge && <span className="absolute -top-1 right-0 rounded bg-[#ef4444] px-1.5 py-0.5 text-[11px] font-medium text-white">{t.badge}</span>}<t.icon className="size-7 text-[#55aee8]" /><span className="text-[13px] leading-5 text-[#1b1f23]">{t.label}</span></Link>)}</section>
    <div className="mt-7 flex items-center justify-between"><h2 className="text-xl font-semibold text-[#1b1f23]">Shortcuts</h2><Link to="/more" className="flex items-center gap-2 text-base font-semibold text-[#55aee8]"><FilePlus2 className="size-5" />Edit Menu</Link></div>
    <section className="biz-surface mt-3 grid grid-cols-3 gap-y-5 px-2 py-5 sm:grid-cols-4">{shortcuts.filter(t => ok(t.to)).map(t => <Round key={t.label} t={t} />)}</section>
  </main>;
}
