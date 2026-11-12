import { useCan } from './permission-checklist';
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ArrowLeftRight, Banknote, Landmark, Pencil, Plus, Smartphone } from 'lucide-react';
import Decimal from 'decimal.js';
import { Button } from '@/components/ui/button';
import { Screen, type CommerceData } from './screen';
import { useCommerce, type CommerceWorkspace } from './commerce-workspace';
import { AdjustDialog, NewAccountDialog, TransferDialog } from './account-dialogs';
import { getAccountBalances } from '@/lib/accounts.functions';
import { kindLabel, type NamedAccount } from '@/lib/account-schemas';
import { formatNPR } from '@/lib/format';

const icon = { cash: Banknote, bank: Landmark, wallet: Smartphone } as const;
const tone = (v: number) => (v < 0 ? 'text-red-500' : 'text-emerald-600');

function Body({ w, commerce }: { w: CommerceWorkspace; commerce: CommerceData }) {
  const canManage = ['owner', 'admin', 'accountant'].includes(commerce.role);
  const load = useServerFn(getAccountBalances);
  const accounts = useQuery({ queryKey: ['accounts', w.businessId], queryFn: () => load({ data: { businessId: w.businessId } }), enabled: canManage, retry: false });
  const [dialog, setDialog] = useState<{ type: 'new' } | { type: 'adjust' | 'transfer'; account: NamedAccount } | null>(null);
  const periods = commerce.periods;
  const journal = (code: string) => commerce.journals.filter(j => j.account_code === code).reduce((s, j) => s.plus(j.debit).minus(j.credit), new Decimal(0)).toNumber();

  // Without access to named accounts (or before they load) the screen shows the three overall balances from the books.
  const named = accounts.data?.accounts.filter(a => a.isActive) ?? [];
  const un = accounts.data?.unassigned;
  const rows = accounts.data
    ? [...named.map(a => ({ key: a.id, name: a.name, sub: kindLabel(a.kind), value: a.balance, kind: a.kind as 'cash' | 'bank' | 'wallet', account: a })),
       ...(['cash', 'bank', 'wallet'] as const).filter(k => Math.abs(un?.[k] ?? 0) > 0.004).map(k => ({ key: `un-${k}`, name: k === 'cash' ? 'Cash in counters and other' : `${kindLabel(k)} (not in a named account)`, sub: 'Not assigned', value: un![k], kind: k, account: null as NamedAccount | null }))]
    : (['cash', 'bank', 'wallet'] as const).map(k => ({ key: k, name: kindLabel(k) === 'Cash (safe)' ? 'Cash' : kindLabel(k), sub: '', value: journal(k), kind: k, account: null as NamedAccount | null }));
  const total = rows.reduce((s, r) => s + r.value, 0);

  return <>
    <section className="mt-5 rounded-2xl border bg-card p-5"><p className="text-sm text-muted-foreground">Overall Account Balance</p><p className={`mt-1 text-3xl font-semibold tabular-nums ${tone(total)}`}>{formatNPR(total)}</p></section>
    <div className="mb-2 mt-6 flex items-center justify-between"><h2 className="text-lg font-semibold">All Accounts</h2>{canManage && can('accounts.create') && <Button size="sm" onClick={() => setDialog({ type: 'new' })}><Plus />New account</Button>}</div>
    {accounts.error && canManage && <p role="alert" className="mb-2 text-sm text-destructive">Named accounts could not be loaded: {accounts.error.message}</p>}
    <ul className="divide-y rounded-2xl border bg-card">{rows.map(r => { const Icon = icon[r.kind]; return <li key={r.key} className="flex items-center gap-3 px-4 py-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><Icon className="size-5" /></span>
      <span className="min-w-0 flex-1"><span className="block break-words text-base">{r.name}</span>{r.sub && <span className="block text-xs text-muted-foreground">{r.sub}</span>}</span>
      <span className={`shrink-0 font-semibold tabular-nums ${tone(r.value)}`}>{formatNPR(r.value)}</span>
      {r.account && canManage && <span className="flex shrink-0 gap-1"><Button size="icon" variant="ghost" title={`Adjust ${r.account.name}`} aria-label={`Adjust ${r.account.name}`} onClick={() => setDialog({ type: 'adjust', account: r.account! })}><Pencil /></Button><Button size="icon" variant="ghost" title={`Transfer from ${r.account.name}`} aria-label={`Transfer from ${r.account.name}`} onClick={() => setDialog({ type: 'transfer', account: r.account! })}><ArrowLeftRight /></Button></span>}
    </li>; })}
      {!rows.length && <li className="px-4 py-10 text-center text-sm text-muted-foreground">No accounts yet.</li>}</ul>
    {canManage && can('accounts.create') && accounts.data && !named.length && <p className="mt-3 text-sm text-muted-foreground">Add your banks, wallets and safe with <strong>New account</strong>, then choose one whenever you take a payment or record an expense.</p>}
    <div className="mt-5 flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/accounting" search={{ view: 'cashbook' }}>Open cash book</Link></Button><Button asChild variant="outline"><Link to="/cash-counters">Cash counters</Link></Button></div>
    {dialog?.type === 'new' && <NewAccountDialog w={w} periods={periods} onClose={() => setDialog(null)} />}
    {dialog?.type === 'adjust' && <AdjustDialog w={w} periods={periods} account={dialog.account} onClose={() => setDialog(null)} />}
    {dialog?.type === 'transfer' && <TransferDialog w={w} periods={periods} from={dialog.account} all={named} onClose={() => setDialog(null)} />}
  </>;
}

export function CashBank() {
  const w = useCommerce(); const can = useCan(w.businessId);
  return <Screen title="Cash & Bank Accounts" w={w}>{({ commerce }) => <Body w={w} commerce={commerce} />}</Screen>;
}
