import {CreditAlert,CreditLimitEditor} from './party-credit';
import {PartyStatementShare} from './party-statement-share';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ArrowDown, ArrowLeft, ArrowUp, Building2, Phone, Plus, Printer, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DualDateInput } from './dual-date-input';
import { useCommerce, type CommerceWorkspace } from './commerce-workspace';
import { recordPayment } from '@/lib/commerce.functions';
import { getAccountBalances, recordPaymentTagged } from '@/lib/accounts.functions';
import { accountsOfKind, rememberAccount, rememberedAccount } from '@/lib/account-schemas';
import { paymentInput } from '@/lib/commerce-schemas';
import { allBalances, allocatePayment, ledgerEntries, outstandingInvoices, totalOutstanding } from '@/lib/party-ledger';
import { formatBsAd, formatNPR, todayAd } from '@/lib/format';
import { customerLoyalty } from '@/lib/loyalty';

type Party = { id: string; name: string; phone: string; kind: string; is_active: boolean; credit_limit?:number|string|null };
type Tab = 'all' | 'receive' | 'give';

function BalanceText({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted-foreground">Settled</span>;
  return <span className={value > 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-500'}>{formatNPR(Math.abs(value))}<span className="ml-1 text-xs font-normal text-muted-foreground">{value > 0 ? 'To receive' : 'To give'}</span></span>;
}

// Records money received from a customer ('in') or paid to a supplier ('out') against their unpaid
// invoices, oldest first. Each part goes through the existing post_commerce_payment function, so
// every database check (roles, open period, cash counter, no overpayment) still applies.
function PaymentDialog({ w, mode, party, parties, onClose, onDone }: { w: CommerceWorkspace; mode: 'in' | 'out'; party?: Party; parties: Party[]; onClose: () => void; onDone: (m: string) => void }) {
  const client = useQueryClient(); const record = useServerFn(recordPayment); const recordTagged = useServerFn(recordPaymentTagged); const loadAccounts = useServerFn(getAccountBalances);
  const data = w.commerce.data!;
  const accountsQuery = useQuery({ queryKey: ['accounts', w.businessId], queryFn: () => loadAccounts({ data: { businessId: w.businessId } }), enabled: ['owner', 'admin', 'accountant'].includes(data.role), retry: false });
  const named = accountsQuery.data?.accounts ?? [];
  const [accountId, setAccountId] = useState('');
  const kind = mode === 'in' ? 'sale' : 'purchase';
  const candidates = parties.filter(p => p.kind === (mode === 'in' ? 'customer' : 'supplier'));
  const [partyId, setPartyId] = useState(party?.id ?? '');
  const [amount, setAmount] = useState(''); const [method, setMethod] = useState<'cash' | 'bank' | 'wallet'>(mode === 'in' ? 'cash' : 'bank');
  const [date, setDate] = useState(todayAd()); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const batch = useRef<ReturnType<typeof paymentInput.parse>[] | null>(null); const done = useRef(new Set<string>());
  const chosen = parties.find(p => p.id === partyId);
  const rows = useMemo(() => (partyId ? outstandingInvoices(partyId, kind, data.documents, data.payments) : []), [partyId, kind, data]);
  const owed = totalOutstanding(rows);
  const reset = () => { batch.current = null; done.current = new Set(); setError(''); };
  const branchName = (id: string) => w.access.data?.branches.find(b => b.id === id)?.name ?? 'this branch';
  const reference = (note.trim() || `Payment ${mode === 'in' ? 'received from' : 'given to'} ${chosen?.name ?? 'party'}`).slice(0, 200);

  async function submit() {
    setBusy(true); setError('');
    try {
      if (!batch.current) {
        const alloc = allocatePayment(rows, Number(amount));
        const period = data.periods.find(p => p.status === 'open' && date >= p.start_date && date <= p.end_date);
        if (!period) throw new Error('No open financial period covers this date.');
        batch.current = alloc.map(a => {
          const session = method === 'cash' ? data.counters.find(e => e.kind === 'open' && e.actor_id === data.userId && e.branch_id === a.branchId && !data.counters.some(c => c.kind === 'close' && c.session_id === e.session_id))?.session_id ?? null : null;
          if (method === 'cash' && !session) throw new Error(`Open your cash counter for ${branchName(a.branchId)} first, or choose Bank or Wallet.`);
          return paymentInput.parse({ id: crypto.randomUUID(), businessId: w.businessId, documentId: a.documentId, periodId: period.id, date, method, amount: a.amount, sessionId: session, reference });
        });
      }
      for (const r of batch.current) { if (done.current.has(r.id)) continue; if (accountId && method !== 'cash') await recordTagged({ data: { request: r, accountId } }); else await record({ data: r }); done.current.add(r.id); }
      await client.invalidateQueries();
      onDone(`${formatNPR(Number(amount))} ${mode === 'in' ? 'received from' : 'paid to'} ${chosen?.name}.`);
    } catch (e) {
      const partial = done.current.size ? ` ${done.current.size} invoice payment(s) were already recorded; pressing Confirm again continues with the rest.` : '';
      setError((e instanceof Error ? e.message : 'Payment could not be recorded.') + partial);
      if (done.current.size) await client.invalidateQueries();
    } finally { setBusy(false); }
  }

  const preview = (() => { try { return Number(amount) > 0 ? allocatePayment(rows, Number(amount)) : []; } catch { return []; } })();
  return <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>{mode === 'in' ? 'Receive payment' : 'Give payment'}</DialogTitle><DialogDescription>{mode === 'in' ? 'Money received from a customer is applied to their oldest unpaid invoices first.' : 'Money paid to a supplier is applied to their oldest unpaid bills first.'}</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <label className="block text-sm">{mode === 'in' ? 'Customer' : 'Supplier'}<select aria-label="Payment party" className="mt-1 h-11 w-full rounded-md border bg-card px-3" value={partyId} disabled={!!party || busy} onChange={e => { setPartyId(e.target.value); setAmount(''); reset(); }}><option value="">Select {mode === 'in' ? 'customer' : 'supplier'}</option>{candidates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {partyId && <div className="rounded-lg bg-secondary/50 p-3 text-sm"><div className="flex items-center justify-between"><span>Outstanding</span><span className="font-semibold">{formatNPR(owed)}</span></div>{!rows.length && <p className="mt-2 text-muted-foreground">No unpaid {kind === 'sale' ? 'sales' : 'purchases'} for this party.</p>}</div>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Amount (NPR)<div className="mt-1 flex gap-2"><Input aria-label="Payment amount" className="h-11" type="number" inputMode="decimal" min="0" step="0.01" value={amount} disabled={busy} onChange={e => { setAmount(e.target.value); reset(); }} /><Button type="button" variant="outline" className="h-11" disabled={!owed || busy} onClick={() => { setAmount(String(owed)); reset(); }}>Full</Button></div></label>
          <label className="block text-sm">Method<select aria-label="Payment method" className="mt-1 h-11 w-full rounded-md border bg-card px-3" value={method} disabled={busy} onChange={e => { const m = e.target.value as typeof method; setMethod(m); setAccountId(m === 'cash' ? '' : rememberedAccount(w.businessId, m, accountsOfKind(named, m))); reset(); }}><option value="cash">Cash</option><option value="bank">Bank</option><option value="wallet">Wallet</option></select></label>
        </div>
        {method !== 'cash' && accountsOfKind(named, method).length > 0 && <label className="block text-sm">Account<select aria-label="Payment account" className="mt-1 h-11 w-full rounded-md border bg-card px-3" value={accountId} disabled={busy} onChange={e => { setAccountId(e.target.value); rememberAccount(w.businessId, method, e.target.value); reset(); }}><option value="">Not assigned</option>{accountsOfKind(named, method).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
        <DualDateInput value={date} onChange={d => { setDate(d); reset(); }} />
        <label className="block text-sm">Note (optional)<Input className="mt-1 h-11" maxLength={160} value={note} disabled={busy} onChange={e => { setNote(e.target.value); reset(); }} /></label>
        {preview.length > 0 && <ul className="divide-y rounded-lg border text-sm">{preview.map(p => <li key={p.documentId} className="flex justify-between gap-3 px-3 py-2"><span className="min-w-0 break-words">{p.reference}</span><span className="shrink-0 tabular-nums">{formatNPR(p.amount)}</span></li>)}</ul>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {method === 'cash' && <p className="text-xs text-muted-foreground">Cash payments need your open cash counter for the invoice's branch (<Link to="/cash-counters" className="underline">Cash counters</Link>).</p>}
        <Button className="h-11 w-full" disabled={busy || !partyId || !(Number(amount) > 0)} onClick={submit}>{busy ? 'Recording…' : `Confirm ${amount ? formatNPR(Number(amount)) : ''}`}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

export function Parties() {
  const w = useCommerce(); const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { party?: string; tab?: Tab };
  const [text, setText] = useState(''); const [tab, setTab] = useState<Tab>(search.tab ?? 'all');
  const [dialog, setDialog] = useState<{ mode: 'in' | 'out'; party?: Party } | null>(null); const [status, setStatus] = useState('');
  const data = w.commerce.data; const parties: Party[] = w.inventory.data?.parties ?? [];
  const balances = useMemo(() => (data ? allBalances(data.documents, data.payments) : new Map<string, number>()), [data]);
  const bal = (id: string) => balances.get(id) ?? 0;
  const toReceive = [...balances.values()].filter(v => v > 0).reduce((s, v) => s + v, 0);
  const toGive = [...balances.values()].filter(v => v < 0).reduce((s, v) => s - v, 0);
  const selected = parties.find(p => p.id === search.party);
  const loyalty = (phone:string) => customerLoyalty(phone,w.inventory.data?.loyalty ?? []);

  const head = <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
    <h1 className="text-2xl font-bold">{selected ? selected.name : 'Parties'}</h1>
    <div className="flex flex-wrap gap-2">
      {!selected && <Button asChild variant="outline" className="h-10"><Link to="/contacts"><Plus />Add party</Link></Button>}
      {(!selected || selected.kind === 'customer') && <Button className="h-10" onClick={() => setDialog({ mode: 'in', ...(selected ? { party: selected } : {}) })}><ArrowDown />Receive payment</Button>}
      {(!selected || selected.kind === 'supplier') && <Button className="h-10 bg-red-500 text-white hover:bg-red-600" onClick={() => setDialog({ mode: 'out', ...(selected ? { party: selected } : {}) })}><ArrowUp />Give payment</Button>}
    </div>
  </header>;
  const wrap = (children: React.ReactNode) => <main className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-7">{head}{status && <p role="status" className="mt-3 border-l-2 border-primary pl-3 text-sm print:hidden">{status}</p>}{children}{dialog && data && <PaymentDialog key={`${dialog.mode}:${dialog.party?.id ?? ''}`} w={w} mode={dialog.mode} {...(dialog.party ? { party: dialog.party } : {})} parties={parties} onClose={() => setDialog(null)} onDone={m => { setDialog(null); setStatus(m); }} />}</main>;

  if (!w.businessId) return wrap(<section className="py-16 text-center"><Building2 className="mx-auto mb-4 size-9 text-primary" /><h2 className="text-xl font-semibold">No business linked yet</h2><Button asChild className="mt-5"><Link to="/businesses">Business setup</Link></Button></section>);
  if (w.commerce.error || w.inventory.error) return wrap(<div className="py-8"><p role="alert" className="text-sm text-destructive">{w.commerce.error?.message || w.inventory.error?.message}</p><Button className="mt-4" variant="outline" onClick={() => { w.commerce.refetch(); w.inventory.refetch(); }}>Try again</Button></div>);
  if (!data || !w.inventory.data || !w.access.data) return wrap(<p role="status" className="py-8 text-sm">Loading parties…</p>);

  if (selected) {
    const entries = ledgerEntries(selected.id, data.documents, data.payments);
    const owedRows = outstandingInvoices(selected.id, selected.kind === 'supplier' ? 'purchase' : 'sale', data.documents, data.payments);
    return wrap(<>
      <Button variant="ghost" className="mt-2 print:hidden" onClick={() => navigate({ to: '/parties', search: {} })}><ArrowLeft />All parties</Button>
      <section className="mt-2 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5">
        <div><p className="text-sm capitalize text-muted-foreground">{selected.kind}{selected.phone ? <> · <Phone className="inline size-3" /> {selected.phone}</> : null}</p><p className="mt-2 text-2xl font-semibold tabular-nums"><BalanceText value={bal(selected.id)} /></p></div>
        <div className="flex flex-wrap gap-2 print:hidden"><PartyStatementShare businessId={w.businessId} business={data.business.name} party={selected.name} phone={selected.phone} balance={bal(selected.id)} invoices={owedRows.map(o=>({reference:o.doc.reference,outstanding:o.outstanding}))}/><Button variant="outline" onClick={() => window.print()}><Printer />Print statement</Button></div>
      </section>
      {selected.kind==='customer'&&<section className="border-b py-4 print:hidden"><CreditAlert balance={bal(selected.id)} limit={selected.credit_limit==null?null:Number(selected.credit_limit)}/>{['owner','admin'].includes(data.role)&&<CreditLimitEditor key={selected.id} businessId={w.businessId} partyId={selected.id} limit={selected.credit_limit==null?null:Number(selected.credit_limit)}/>}</section>}
      {owedRows.length > 0 && <section className="mt-5 print:hidden"><h2 className="text-sm font-semibold">Unpaid {selected.kind === 'supplier' ? 'bills' : 'invoices'} · {formatNPR(totalOutstanding(owedRows))}</h2><ul className="mt-2 divide-y rounded-xl border bg-card text-sm">{owedRows.map(o => <li key={o.doc.id} className="flex items-center justify-between gap-3 px-4 py-3"><span className="min-w-0"><span className="block break-words font-medium">{o.doc.reference}</span><span className="block text-xs text-muted-foreground">{formatBsAd(o.doc.document_date)}</span></span><span className="shrink-0 font-medium tabular-nums">{formatNPR(o.outstanding)}</span></li>)}</ul></section>}
      <section className="mt-5"><h2 className="text-sm font-semibold">Ledger</h2>
        <div className="mt-2 overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[34rem] text-sm"><thead className="border-b bg-secondary/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Entry</th><th className="px-4 py-2 text-right font-medium">Amount</th><th className="px-4 py-2 text-right font-medium">Balance</th></tr></thead>
          <tbody>{entries.map((e, i) => <tr key={i} className="border-b last:border-0"><td className="px-4 py-3 align-top text-xs">{formatBsAd(e.date)}</td><td className="px-4 py-3"><span className="block">{e.label}</span><span className="block break-words text-xs text-muted-foreground">{e.reference}</span></td><td className={`px-4 py-3 text-right tabular-nums ${e.amount > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{e.amount > 0 ? '+' : '-'}{formatNPR(Math.abs(e.amount))}</td><td className="px-4 py-3 text-right tabular-nums">{formatNPR(Math.abs(e.balance))}<span className="block text-[11px] text-muted-foreground">{e.balance === 0 ? '' : e.balance > 0 ? 'To receive' : 'To give'}</span></td></tr>)}
            {!entries.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No transactions with this party yet.</td></tr>}</tbody></table></div>
        <p className="mt-2 text-xs text-muted-foreground print:hidden">Positive amounts increase what they owe you; negative amounts reduce it.</p></section>
    </>);
  }

  const q = text.trim().toLowerCase();
  const list = parties.filter(p => (p.is_active || bal(p.id) !== 0) && `${p.name} ${p.phone}`.toLowerCase().includes(q) && (tab === 'all' || (tab === 'receive' ? bal(p.id) > 0 : bal(p.id) < 0))).sort((a, b) => Math.abs(bal(b.id)) - Math.abs(bal(a.id)) || a.name.localeCompare(b.name));
  return wrap(<>
    <section className="mt-5 grid grid-cols-2 gap-3"><article className="rounded-xl bg-emerald-50 p-4"><ArrowDown className="size-4 text-emerald-600" /><p className="mt-3 text-xs text-foreground/70">To Receive</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatNPR(toReceive)}</p></article><article className="rounded-xl bg-rose-50 p-4"><ArrowUp className="size-4 text-rose-600" /><p className="mt-3 text-xs text-foreground/70">To Give</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatNPR(toGive)}</p></article></section>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <div className="flex rounded-lg border p-0.5 text-sm">{([['all', 'All'], ['receive', 'To Receive'], ['give', 'To Give']] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 ${tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{l}</button>)}</div>
      <div className="flex min-w-48 flex-1 items-center gap-2 rounded-lg border bg-card px-3"><Search className="size-4 text-muted-foreground" /><Input aria-label="Search parties" className="h-10 border-0 px-0 shadow-none focus-visible:ring-0" placeholder="Search by name or phone" value={text} onChange={e => setText(e.target.value)} /></div>
    </div>
    <ul className="mt-4 divide-y rounded-xl border bg-card">{list.map(p => <li key={p.id}><button type="button" className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/40" onClick={() => navigate({ to: '/parties', search: { party: p.id } })}><span className="min-w-0"><span className="block break-words font-medium">{p.name}</span><span className="block text-xs capitalize text-muted-foreground">{p.kind}{p.phone ? ` · ${p.phone}` : ''}</span>{p.kind==='customer'&&p.credit_limit!=null&&bal(p.id)>Number(p.credit_limit)&&<span className="block text-xs text-destructive">Credit limit exceeded · {formatNPR(p.credit_limit)}</span>}</span><span className="shrink-0 text-sm tabular-nums"><BalanceText value={bal(p.id)} /></span></button></li>)}
      {!list.length && <li className="px-4 py-12 text-center text-sm text-muted-foreground">{parties.length ? 'No parties match.' : 'No parties yet. Add your first customer or supplier.'}</li>}</ul>
  </>);
}
