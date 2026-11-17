import { Link, getRouteApi } from '@tanstack/react-router';
import { BarChart3, BookOpen, Banknote, CalendarDays, ChevronRight, Landmark, Package, Receipt, Scale, ShoppingBag, Tag, UserRound, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { ReportInput } from '@/lib/accounting';
import { ReportRangeFilters } from './report-range-filters';
import { reportToday } from '@/lib/report-filters';
import { useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { businessQuery } from '@/lib/inventory-queries';
import { getAccountingReport } from '@/lib/accounting.functions';

const route = getRouteApi('/_authenticated/reports');

type Item = {
  label: string;
  description: string;
  icon: LucideIcon;
  view?: ReportInput['view'];
  to?: '/transactions';
};

const groups: { title: string; description: string; items: Item[] }[] = [
  {
    title: 'Transaction Reports',
    description: 'Review sales, purchases, returns and daily business transactions.',
    items: [
      { label: 'Sales Report', description: 'Confirmed sales, sales returns and net sales.', icon: Tag, view: 'sales' },
      { label: 'Purchase Report', description: 'Confirmed purchases and purchase returns.', icon: ShoppingBag, view: 'purchases' },
      { label: 'Day Book', description: 'Daily invoices, payments and recorded expenses.', icon: CalendarDays, view: 'daybook' },
      { label: 'All Transactions', description: 'Browse the complete transaction register.', icon: Banknote, to: '/transactions' },
      { label: 'Profit & Loss', description: 'Unavailable until product costing is validated.', icon: BarChart3, view: 'profit' },
    ],
  },
  {
    title: 'Party Reports',
    description: 'Understand customer and supplier balances and activity.',
    items: [
      { label: 'Party Statement', description: 'View a selected party’s debit and credit history.', icon: Users, view: 'statement' },
      { label: 'All Party Outstanding', description: 'Review outstanding and credit balances across parties.', icon: Receipt, view: 'outstanding' },
      { label: 'Receivables', description: 'Track customer invoices and amounts to collect.', icon: Receipt, view: 'receivables' },
      { label: 'Payables', description: 'Track supplier invoices and amounts to pay.', icon: Receipt, view: 'payables' },
    ],
  },
  {
    title: 'Inventory Reports',
    description: 'Monitor stock movement, available quantities and low-stock items.',
    items: [
      { label: 'Stock Movement', description: 'Trace quantity changes by item, branch and date.', icon: Package, view: 'stock' },
      { label: 'Stock Quantity & Low Stock', description: 'See current on-hand quantities and reorder alerts.', icon: Package, view: 'lowstock' },
      { label: 'Inventory Valuation', description: 'Unavailable until opening stock and costing are validated.', icon: Scale, view: 'valuation' },
    ],
  },
  {
    title: 'Income & Expense Reports',
    description: 'Review recorded operating expenses and accounting entries.',
    items: [
      { label: 'Income & Expense', description: 'Review recorded expense postings for the selected period.', icon: Wallet, view: 'expenses' },
      { label: 'Cash Flow', description: 'Review recorded cash, bank and wallet movements.', icon: BarChart3, view: 'cashflow' },
      { label: 'Tax Summary', description: 'Review configured VAT postings; not a tax filing.', icon: Receipt, view: 'vat' },
    ],
  },
  {
    title: 'Business Status Reports',
    description: 'Review staff activity, cash, bank and accounting position.',
    items: [
      { label: 'Staff Report', description: 'Sales and collections attributed to posting staff.', icon: UserRound, view: 'staff' },
      { label: 'Cash in Hand', description: 'View recorded cash account movements and balance.', icon: Wallet, view: 'cash' },
      { label: 'Bank Statement', description: 'View bank and digital wallet account movements.', icon: Landmark, view: 'bank' },
      { label: 'Business Status', description: 'Summary of recorded balances and operating indicators.', icon: Scale, view: 'balance' },
      { label: 'Trial Balance', description: 'Review debit and credit totals from recorded journals.', icon: BookOpen, view: 'trial' },
    ],
  },
];

function ReportCard({ item }: { item: Item }) {
  const search = route.useSearch();
  const cls = 'report-link-card group flex min-h-[6rem] items-start gap-3 rounded-xl border bg-card px-4 py-4 text-sm shadow-sm transition-colors hover:border-primary/40 hover:bg-secondary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring';
  const inner = (
    <>
      <item.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">{item.label}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span>
      </span>
      <ChevronRight className="mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </>
  );
  return item.to ? (
    <Link to={item.to} search={search} className={cls}>{inner}</Link>
  ) : (
    <Link to="/accounting" search={{ ...search, view: item.view }} className={cls}>{inner}</Link>
  );
}

export function ReportsHub() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const { data: businesses } = useSuspenseQuery(businessQuery);
  const business = businesses.find(b => b.id === search.business)?.id ?? businesses[0]?.id;
  const load = useServerFn(getAccountingReport);
  const branches = useQuery({
    queryKey: ['report-branches', business],
    queryFn: () => load({ data: { businessId: business ?? '', view: 'accounts', from: '2000-01-01', to: reportToday(), account: 'all', page: 1, export: false } }),
    enabled: !!business,
  });

  return (
    <main className="reports-hub mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 md:py-7 lg:px-8">
      <header className="reports-heading flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-4 shadow-sm sm:px-5">
        <div>
          <p className="text-[11px] font-semibold tracking-[.12em] text-primary">BIZSATHI NEPAL</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Business reports, statements and operational summaries</p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">Reports centre</span>
      </header>
      <div className="reports-filters mt-4 grid grid-cols-1 gap-4 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <ReportRangeFilters
          branch={search.branch ?? 'all'}
          from={search.from ?? '2000-01-01'}
          to={search.to ?? reportToday()}
          branches={branches.data?.branches ?? []}
          onChange={next => { void navigate({ search: prev => ({ ...prev, ...next, business }), replace: true }); }}
        />
      </div>
      {groups.map(group => (
        <section className="report-group mt-7" key={group.title}>
          <div className="mb-3">
            <h2 className="text-base font-semibold tracking-tight text-foreground">{group.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
          </div>
          <ul className="report-card-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map(item => <li key={item.label}><ReportCard item={item} /></li>)}
          </ul>
        </section>
      ))}
    </main>
  );
}
