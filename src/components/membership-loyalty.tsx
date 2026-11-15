import { useMemo, useState } from 'react';
import { Search, Users, Award, Sparkles, ArrowUpRight, ArrowDownRight, ChevronRight, Gift, Phone, CalendarDays, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCommerce, CommerceFrame } from '@/components/commerce-workspace';
import { formatNPR } from '@/lib/format';
import { normalizeMobile } from '@/lib/loyalty';

type Member = { id: string; mobile: string; membership_number: string; created_at?: string };
type LoyaltySummary = { mobile: string; membership_number: string; points: string; purchase_count: string };
type PointEvent = { id: string; membership_id: string; points: number | string; document_id: string; sale_id: string; created_at: string };
type Redemption = { id: string; membership_id: string; kind: 'spend' | 'restore'; points: number | string; discount: number | string; created_at: string; sale_id: string };
type Document = { id: string; kind: string; status: string; document_date?: string; created_at: string; request?: unknown };

function dateLabel(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
function mobileFromRequest(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  return normalizeMobile(String((value as Record<string, unknown>)['mobile'] ?? ''));
}

export function MembershipLoyalty() {
  const w = useCommerce();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [view, setView] = useState<'all' | 'positive' | 'zero'>('all');
  const data = w.commerce.data;
  const inventory = w.inventory.data;

  const members = useMemo(() => {
    if (!data || !inventory) return [];
    const memberships = data.memberships as Member[];
    const summaries = inventory.loyalty as LoyaltySummary[];
    const parties = inventory.parties as { name: string; phone: string; kind: string }[];
    const docs = data.documents as Document[];
    return memberships.map(member => {
      const summary = summaries.find(row => normalizeMobile(row.mobile) === member.mobile);
      const customer = parties.find(p => p.kind === 'customer' && normalizeMobile(p.phone) === member.mobile);
      const lastSale = docs.filter(doc => doc.kind === 'sale' && doc.status === 'confirmed' && mobileFromRequest(doc.request) === member.mobile)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return { ...member, name: customer?.name || 'Customer', points: Number(summary?.points ?? 0), purchases: Number(summary?.purchase_count ?? 0), lastPurchase: lastSale?.document_date || lastSale?.created_at };
    }).sort((a, b) => b.points - a.points || a.mobile.localeCompare(b.mobile));
  }, [data, inventory]);

  const filtered = members.filter(member => {
    const matches = `${member.name} ${member.mobile} ${member.membership_number}`.toLowerCase().includes(search.toLowerCase());
    return matches && (view === 'all' || (view === 'positive' ? member.points > 0 : member.points <= 0));
  });
  const selected = members.find(member => member.id === selectedId);
  const events = (data?.loyalty ?? []) as PointEvent[];
  const redemptions = (data?.redemptions ?? []) as Redemption[];
  const memberEvents = selected ? events.filter(event => event.membership_id === selected.id) : [];
  const memberRedemptions = selected ? redemptions.filter(event => event.membership_id === selected.id) : [];
  const issued = events.reduce((sum, event) => sum + Math.max(0, Number(event.points)), 0);
  const spent = redemptions.filter(event => event.kind === 'spend').reduce((sum, event) => sum + Math.abs(Number(event.points)), 0);
  const outstanding = members.reduce((sum, member) => sum + member.points, 0);

  return <CommerceFrame w={w} title="Membership & Loyalty" active="/membership">
    <section className="space-y-6 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">CRM / Membership & Loyalty</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Customer rewards</h2><p className="mt-1 text-sm text-muted-foreground">View member balances, purchase activity and the points ledger.</p></div>
        {selected && <Button variant="outline" onClick={() => setSelectedId('')}>Back to members</Button>}
      </div>
      {!selected && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>Total members</span><Users className="size-4"/></div><p className="mt-3 text-2xl font-semibold tabular-nums">{members.length.toLocaleString('en-IN')}</p><p className="mt-1 text-xs text-muted-foreground">Registered mobile memberships</p></article>
        <article className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>Points issued</span><ArrowUpRight className="size-4"/></div><p className="mt-3 text-2xl font-semibold tabular-nums">{issued.toLocaleString('en-IN')}</p><p className="mt-1 text-xs text-muted-foreground">Including sale adjustments</p></article>
        <article className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>Points redeemed</span><Gift className="size-4"/></div><p className="mt-3 text-2xl font-semibold tabular-nums">{spent.toLocaleString('en-IN')}</p><p className="mt-1 text-xs text-muted-foreground">Redemption transactions</p></article>
        <article className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>Outstanding points</span><Award className="size-4"/></div><p className="mt-3 text-2xl font-semibold tabular-nums">{outstanding.toLocaleString('en-IN')}</p><p className="mt-1 text-xs text-muted-foreground">Current member balances</p></article>
      </div>}
      {selected ? <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <article className="rounded-xl border bg-card p-5">
          <div className="flex items-start gap-3"><span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Award className="size-6"/></span><div className="min-w-0 flex-1"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Membership number</p><h3 className="mt-1 text-xl font-semibold">{selected.membership_number}</h3><p className="mt-1 text-sm text-muted-foreground">{selected.name}</p></div></div>
          <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-lg bg-secondary/60 p-3"><p className="text-xs text-muted-foreground">Available points</p><p className="mt-1 text-2xl font-semibold tabular-nums">{selected.points.toLocaleString('en-IN')}</p></div><div className="rounded-lg bg-secondary/60 p-3"><p className="text-xs text-muted-foreground">Confirmed purchases</p><p className="mt-1 text-2xl font-semibold tabular-nums">{selected.purchases}</p></div></div>
          <div className="mt-5 space-y-3 text-sm"><p className="flex items-center gap-2"><Phone className="size-4 text-muted-foreground"/>{selected.mobile}</p><p className="flex items-center gap-2"><CalendarDays className="size-4 text-muted-foreground"/>Last purchase: {dateLabel(selected.lastPurchase)}</p><p className="flex items-center gap-2"><Sparkles className="size-4 text-muted-foreground"/>Earn rate: 10 points per NPR 100</p><p className="flex items-center gap-2"><Gift className="size-4 text-muted-foreground"/>Redemption: 100 points = NPR 1</p></div>
        </article>
        <article className="rounded-xl border bg-card p-5"><h3 className="font-semibold">Points activity</h3><p className="mt-1 text-xs text-muted-foreground">Append-only history from confirmed sales, returns and redemptions.</p>
          <div className="mt-4 space-y-3">
            {[...memberEvents.map(e=>({id:e.id,points:Number(e.points),created_at:e.created_at,label:e.points >= 0 ? 'Points earned' : 'Return adjustment',kind:e.points >= 0 ? 'earn' : 'adjust'})),...memberRedemptions.map(e=>({id:e.id,points:Number(e.points),created_at:e.created_at,label:e.kind==='spend'?'Points redeemed':'Points restored',kind:e.kind}))].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(row=><div key={row.id} className="flex items-center justify-between gap-3 border-b pb-3 text-sm last:border-0"><div className="min-w-0"><p className="font-medium">{row.label}</p><p className="text-xs text-muted-foreground">{dateLabel(row.created_at)}</p></div><span className={`shrink-0 font-semibold tabular-nums ${row.points>=0?'text-emerald-600':'text-muted-foreground'}`}>{row.points>0?'+':''}{row.points.toLocaleString('en-IN')}</span></div>)}
            {!memberEvents.length && !memberRedemptions.length && <p className="py-8 text-center text-sm text-muted-foreground">No points activity yet.</p>}
          </div>
        </article>
      </div> : <>
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" placeholder="Search name, mobile or member ID" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div className="flex gap-1 rounded-lg bg-secondary p-1">{(['all','positive','zero'] as const).map(key=><Button key={key} size="sm" variant={view===key?'default':'ghost'} onClick={()=>setView(key)}>{key==='all'?'All members':key==='positive'?'With points':'Zero / negative'}</Button>)}</div>
        </div>
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3"><div><h3 className="font-semibold">Membership directory</h3><p className="text-xs text-muted-foreground">{filtered.length} of {members.length} members</p></div><span className="text-xs text-muted-foreground">Sorted by points</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-secondary/50 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Member</th><th className="px-4 py-3 font-medium">Mobile</th><th className="px-4 py-3 font-medium">Purchases</th><th className="px-4 py-3 font-medium">Available points</th><th className="px-4 py-3 font-medium">Last purchase</th><th className="px-4 py-3"/></tr></thead><tbody className="divide-y">{filtered.map(member=><tr key={member.id} className="hover:bg-secondary/30"><td className="px-4 py-3"><button className="text-left font-medium hover:text-primary" onClick={()=>setSelectedId(member.id)}>{member.name}<span className="mt-0.5 block text-xs font-normal text-muted-foreground">{member.membership_number}</span></button></td><td className="px-4 py-3 tabular-nums">{member.mobile}</td><td className="px-4 py-3 tabular-nums">{member.purchases}</td><td className="px-4 py-3 font-semibold tabular-nums">{member.points.toLocaleString('en-IN')}</td><td className="px-4 py-3 text-muted-foreground">{dateLabel(member.lastPurchase)}</td><td className="px-4 py-3"><Button size="icon" variant="ghost" aria-label={`View ${member.membership_number}`} onClick={()=>setSelectedId(member.id)}><ChevronRight className="size-4"/></Button></td></tr>)}
          </tbody></table></div>
          {!filtered.length && <div className="px-4 py-12 text-center"><Users className="mx-auto size-8 text-muted-foreground"/><p className="mt-3 font-medium">No members found</p><p className="mt-1 text-sm text-muted-foreground">{members.length?'Try another search or filter.':'Memberships are created automatically when a confirmed sale is made with a valid mobile number.'}</p></div>}
        </div>
      </>}
      <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground"><p className="font-medium text-foreground">Current loyalty rules</p><p className="mt-1">Points are earned on confirmed NPR sales at 10 points per NPR 100. Returns adjust earned points, and redemption is valued at 100 points = NPR 1. Points are not manually editable from this screen.</p></div>
    </section>
  </CommerceFrame>;
}
