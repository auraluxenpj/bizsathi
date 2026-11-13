import { useMemo, useState } from 'react';
import { Link,getRouteApi } from '@tanstack/react-router';
import { Search,Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Screen } from './screen';
import { useCommerce } from './commerce-workspace';
import { formatBsAd, formatNPR } from '@/lib/format';
import {ReportRangeFilters} from './report-range-filters';
import {reportToday,validReportDates} from '@/lib/report-filters';
import {filterTransactions,transactionTotals} from '@/lib/transaction-report';
import {downloadCsv} from '@/lib/download-csv';
import {makeCsv} from '@/lib/inventory-csv';
const route=getRouteApi('/_authenticated/transactions');

type Filter = 'all' | 'sales' | 'purchases' | 'in' | 'out' | 'returns';
const filters: [Filter, string][] = [['all', 'All'], ['sales', 'Sales'], ['purchases', 'Purchases'], ['in', 'Payment In'], ['out', 'Payment Out'], ['returns', 'Returns']];
const labels: Record<string, string> = { sale: 'Sale', purchase: 'Purchase', sale_return: 'Sale return', purchase_return: 'Purchase return', purchase_order: 'Purchase order', goods_receipt: 'Goods receipt' };

// One list of everything that happened: confirmed documents plus the payments recorded against them.
export function Transactions() {
  const w = useCommerce();
  const search=route.useSearch();const navigate=route.useNavigate();const from=search.from??'2000-01-01',to=search.to??reportToday(),branch=search.branch??'all';const datesValid=validReportDates(from,to);
  const [filter, setFilter] = useState<Filter>('all'); const [text, setText] = useState(''); const [limit, setLimit] = useState(40);
  const rows = useMemo(() => {
    const d = w.commerce.data; const inv = w.inventory.data;
    if (!d || !inv) return [];
    const party = new Map(inv.parties.map(p => [p.id, p.name]));
    const docs = new Map(d.documents.map(x => [x.id, x]));
    const fromDocs = d.documents.filter(x => x.status === 'confirmed').map(x => ({ key: `d${x.id}`, type: x.kind, label: labels[x.kind] ?? x.kind, date: x.document_date, created: x.created_at, party: x.party_id ? party.get(x.party_id) ?? '' : 'Walk-in', reference: x.reference, amount: Number(x.total), tone: x.kind === 'sale' || x.kind === 'purchase_return' ? 'text-emerald-600' : 'text-foreground' }));
    const fromPayments = d.payments.map(p => { const doc = docs.get(p.document_id); return { key: `p${p.id}`, type: p.direction === 'in' ? 'payment_in' : 'payment_out', label: p.direction === 'in' ? 'Payment in' : 'Payment out', date: p.payment_date, created: p.created_at, party: doc?.party_id ? party.get(doc.party_id) ?? '' : 'Walk-in', reference: p.reference || doc?.reference || '', amount: Number(p.amount), tone: p.direction === 'in' ? 'text-emerald-600' : 'text-red-500' }; });
    return [...fromDocs, ...fromPayments].sort((a, b) => (b.date + b.created).localeCompare(a.date + a.created));
  }, [w.commerce.data, w.inventory.data]);
  const visible=datesValid?filterTransactions(rows,{from,to,branch,type:filter,search:text}):[];const totals=transactionTotals(visible);const branches=w.access.data?.branches??[];const branchName=branch==='all'?'All authorized branches':branches.find(b=>b.id===branch)?.name??branch;
  function exportCsv(){downloadCsv(`auraluxe-transactions-${from}-${to}.csv`,makeCsv(visible.map(r=>({From:from,Through:to,'Branch filter':branchName,'Type filter':filter,Search:text,'Document total':totals.documents,'Payments in total':totals.paymentsIn,'Payments out total':totals.paymentsOut,Date:r.date,Branch:branches.find(b=>b.id===r.branchId)?.name??r.branchId,Type:r.label,Party:r.party,Reference:r.reference,Amount:r.amount}))));}
  return <Screen title="Transactions" w={w} right={<Button asChild variant="outline" size="sm"><Link to="/accounting" search={{ view: 'ledger' }}>Day Book</Link></Button>}>{() => <>
    <div className="mt-4 grid grid-cols-1 gap-4 border-y py-4 sm:grid-cols-2 lg:grid-cols-4"><ReportRangeFilters branch={branch} from={from} to={to} branches={branches} onChange={next=>{setLimit(40);void navigate({search:prev=>({...prev,...next,business:w.businessId}),replace:true});}}/></div>
    {!datesValid&&<p role="alert" className="py-4 text-destructive">Select a valid start and end date.</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"><p className="tabular-nums">{visible.length} transactions · Documents NPR {totals.documents} · Payments in NPR {totals.paymentsIn} · Payments out NPR {totals.paymentsOut}</p><Button variant="outline" disabled={!visible.length||!datesValid} onClick={exportCsv}><Download/>CSV</Button></div>
    <div className="mt-4 flex items-center gap-2 rounded-lg border bg-card px-3"><Search className="size-4 text-muted-foreground" /><Input aria-label="Search transactions" className="h-11 border-0 px-0 shadow-none focus-visible:ring-0" placeholder="Search party or reference" value={text} onChange={e => { setText(e.target.value); setLimit(40); }} /></div>
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{filters.map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setLimit(40); }} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${filter === k ? 'border-primary bg-primary/10 font-medium text-primary' : 'text-muted-foreground'}`}>{l}</button>)}</div>
    <ul className="mt-4 divide-y rounded-2xl border bg-card">{visible.slice(0, limit).map(r => <li key={r.key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="min-w-0"><span className="block break-words font-medium">{r.party || '—'}</span><span className="block break-words text-xs text-muted-foreground">{r.label} · {r.reference}</span><span className="block text-xs text-muted-foreground">{formatBsAd(r.date)}</span></span><span className={`shrink-0 font-semibold tabular-nums ${r.tone}`}>{formatNPR(r.amount)}</span></li>)}
      {!visible.length && <li className="px-4 py-12 text-center text-sm text-muted-foreground">No transactions found.</li>}</ul>
    {visible.length > limit && <Button className="mt-4 w-full" variant="outline" onClick={() => setLimit(limit + 40)}>Show more</Button>}
  </>}</Screen>;
}
