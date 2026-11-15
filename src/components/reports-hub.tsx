import { Link, getRouteApi } from '@tanstack/react-router';
import { BarChart3, BookOpen, Banknote, CalendarDays, ChevronRight, Landmark, Package, Receipt, Scale, ShoppingBag, Tag, UserRound, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { ReportInput } from '@/lib/accounting';
import {ReportRangeFilters} from './report-range-filters';
import {reportToday} from '@/lib/report-filters';
import {useSuspenseQuery,useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {businessQuery} from '@/lib/inventory-queries';
import {getAccountingReport} from '@/lib/accounting.functions';
const route=getRouteApi('/_authenticated/reports');

type Item = { label: string; icon: LucideIcon; view?: ReportInput['view']; to?: '/transactions' };
const popular: Item[] = [
  { label: 'Sales Report', icon: Tag, view: 'sales' },
  { label: 'Day Book', icon: CalendarDays, view: 'daybook' },
  { label: 'All Transactions Report', icon: Banknote, to: '/transactions' },
  { label: 'Profit & Loss Report', icon: BarChart3, view: 'profit' },
  { label: 'Party Statement', icon: Users, view: 'statement' },
  { label: 'Cash In Hand Statement', icon: Wallet, view: 'cash' },
  { label: 'Bank Statement', icon: Landmark, view: 'bank' },
  { label: 'Staff Report', icon: UserRound, view: 'staff' },
];
const all: Item[] = [
  { label: 'Parties Report', icon: Users, view: 'outstanding' },
  { label: 'Purchase Report', icon: ShoppingBag, view: 'purchases' },
  { label: 'Inventory Report', icon: Package, view: 'valuation' },
  { label: 'Stock Movement', icon: Package, view: 'stock' },
  { label: 'Low Stock', icon: Package, view: 'lowstock' },
  { label: 'Income Expense Report', icon: Wallet, view: 'expenses' },
  { label: 'Receivables', icon: Receipt, view: 'receivables' },
  { label: 'Payables', icon: Receipt, view: 'payables' },
  { label: 'Business Status Report', icon: Scale, view: 'balance' },
  { label: 'Cash Flow', icon: BarChart3, view: 'cashflow' },
  { label: 'VAT / Tax Summary', icon: Receipt, view: 'vat' },
  { label: 'Trial Balance', icon: BookOpen, view: 'trial' },
];

function Row({ item }: { item: Item }) {
  const search=route.useSearch();
  const cls = 'report-link-card group flex min-h-[5.25rem] items-center gap-3 rounded-xl border bg-card px-4 py-4 text-sm shadow-sm transition-colors hover:border-primary/40 hover:bg-secondary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring';
  const inner = <><item.icon className="size-5 text-muted-foreground" /><span className="flex-1">{item.label}</span><ChevronRight className="size-5 text-muted-foreground" /></>;
  return item.to ? <Link to={item.to} search={search} className={cls}>{inner}</Link> : <Link to="/accounting" search={{...search,view:item.view}} className={cls}>{inner}</Link>;
}

export function ReportsHub() {
  const search=route.useSearch();const navigate=route.useNavigate();const {data:businesses}=useSuspenseQuery(businessQuery);const business=businesses.find(b=>b.id===search.business)?.id??businesses[0]?.id;const load=useServerFn(getAccountingReport);
  const branches=useQuery({queryKey:['report-branches',business],queryFn:()=>load({data:{businessId:business??'',view:'accounts',from:'2000-01-01',to:reportToday(),account:'all',page:1,export:false}}),enabled:!!business});
  const group = (title: string, items: Item[]) => <section className="report-group mt-7"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold tracking-wide text-foreground">{title}</h2><span className="text-xs text-muted-foreground">{items.length} reports</span></div><ul className="report-card-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map(i => <li key={i.label}><Row item={i} /></li>)}</ul></section>;
  return <main className="reports-hub mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 md:py-7 lg:px-8">
    <header className="reports-heading flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-4 shadow-sm sm:px-5"><div><p className="text-[11px] font-semibold tracking-[.12em] text-primary">BIZSATHI NEPAL</p><h1 className="mt-1 text-2xl font-bold tracking-tight">View Reports</h1><p className="mt-1 text-sm text-muted-foreground">Explore business activity, balances and financial records</p></div><span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">Reports centre</span></header>
    <div className="reports-filters mt-4 grid grid-cols-1 gap-4 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"><ReportRangeFilters branch={search.branch??'all'} from={search.from??'2000-01-01'} to={search.to??reportToday()} branches={branches.data?.branches??[]} onChange={next=>{void navigate({search:prev=>({...prev,...next,business}),replace:true});}}/></div>
    {group('Popular Reports', popular)}
    {group('Browse All Reports', all)}
  </main>;
}
