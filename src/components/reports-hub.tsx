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
  const cls = 'flex min-h-14 items-center gap-4 px-4 py-3 text-base hover:bg-secondary/50';
  const inner = <><item.icon className="size-5 text-muted-foreground" /><span className="flex-1">{item.label}</span><ChevronRight className="size-5 text-muted-foreground" /></>;
  return item.to ? <Link to={item.to} search={search} className={cls}>{inner}</Link> : <Link to="/accounting" search={{...search,view:item.view}} className={cls}>{inner}</Link>;
}

export function ReportsHub() {
  const search=route.useSearch();const navigate=route.useNavigate();const {data:businesses}=useSuspenseQuery(businessQuery);const business=businesses.find(b=>b.id===search.business)?.id??businesses[0]?.id;const load=useServerFn(getAccountingReport);
  const branches=useQuery({queryKey:['report-branches',business],queryFn:()=>load({data:{businessId:business??'',view:'accounts',from:'2000-01-01',to:reportToday(),account:'all',page:1,export:false}}),enabled:!!business});
  const group = (title: string, items: Item[]) => <section className="mt-6"><h2 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h2><ul className="divide-y rounded-2xl border bg-card">{items.map(i => <li key={i.label}><Row item={i} /></li>)}</ul></section>;
  return <main className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-7">
    <h1 className="text-2xl font-bold">View Reports</h1>
    <div className="mt-5 grid grid-cols-1 gap-4 border-y py-4 sm:grid-cols-2"><ReportRangeFilters branch={search.branch??'all'} from={search.from??'2000-01-01'} to={search.to??reportToday()} branches={branches.data?.branches??[]} onChange={next=>{void navigate({search:prev=>({...prev,...next,business}),replace:true});}}/></div>
    {group('Popular Reports', popular)}
    {group('Browse All Reports', all)}
  </main>;
}
