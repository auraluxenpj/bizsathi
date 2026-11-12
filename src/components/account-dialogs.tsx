import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DualDateInput } from './dual-date-input';
import { PeriodNotice } from './period-notice';
import type { CommerceWorkspace } from './commerce-workspace';
import { adjustAccount, createAccount, transferBetweenAccounts } from '@/lib/accounts.functions';
import { accountKinds, kindLabel, type AccountKind, type NamedAccount } from '@/lib/account-schemas';
import { formatNPR, todayAd } from '@/lib/format';

type Books = { w: CommerceWorkspace; periods: { id: string; status: string; start_date: string; end_date: string }[] };
const field = 'mt-1 h-11 w-full rounded-md border bg-card px-3 text-sm';

/** Everything a posting needs besides the form: a branch and the open financial year for the chosen date. */
function useBooking({ w, periods }: Books) {
  const branches = (w.access.data?.branches ?? []).filter(b => b.is_active);
  const [branch, setBranch] = useState('');
  const branchId = branch || branches[0]?.id || '';
  const [date, setDate] = useState(todayAd());
  const period = periods.find(p => p.status === 'open' && date >= p.start_date && date <= p.end_date);
  return { branches, branchId, setBranch, date, setDate, period };
}
const BranchPick = ({ b }: { b: ReturnType<typeof useBooking> }) => b.branches.length > 1 ? <label className="block text-sm">Branch<select aria-label="Branch" className={field} value={b.branchId} onChange={e => b.setBranch(e.target.value)}>{b.branches.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label> : null;

function useSend<T>(businessId: string, send: () => Promise<T>, onClose: () => void) {
  const client = useQueryClient(); const [error, setError] = useState('');
  const m = useMutation({ mutationFn: send, onSuccess: async () => { await client.invalidateQueries(); onClose(); }, onError: e => setError(e instanceof Error ? e.message : 'That did not work.') });
  return { error, setError, m, run: () => { setError(''); m.mutate(); }, businessId };
}

export function NewAccountDialog({ w, periods, onClose }: Books & { onClose: () => void }) {
  const create = useServerFn(createAccount); const book = useBooking({ w, periods });
  const [id] = useState(() => crypto.randomUUID()); const [name, setName] = useState(''); const [kind, setKind] = useState<AccountKind>('bank'); const [opening, setOpening] = useState('');
  const ok = !!name.trim() && /^\d{0,13}(\.\d{1,2})?$/.test(opening) && !!book.period && !!book.branchId;
  const s = useSend(w.businessId, () => create({ data: { businessId: w.businessId, branchId: book.branchId, periodId: book.period!.id, id, name, kind, opening: opening || '0', date: book.date } }), onClose);
  return <Dialog open onOpenChange={o => { if (!o && !s.m.isPending) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
    <DialogHeader><DialogTitle>New account</DialogTitle><DialogDescription>For example Himalayan Bank, eSewa, or Home Safe. Any opening balance is added to your books as owner capital.</DialogDescription></DialogHeader>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); s.run(); }}>
      <label className="block text-sm">Name<Input aria-label="Account name" className="mt-1 h-11" maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block text-sm">Type<select aria-label="Account type" className={field} value={kind} onChange={e => setKind(e.target.value as AccountKind)}>{accountKinds.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
      <label className="block text-sm">Opening balance (NPR)<Input aria-label="Opening balance" className="mt-1 h-11" inputMode="decimal" placeholder="0" value={opening} onChange={e => setOpening(e.target.value)} /></label>
      <DualDateInput value={book.date} onChange={book.setDate} label="As of" />
      <BranchPick b={book} />
      {!book.period && <PeriodNotice businessId={w.businessId} date={book.date} />}
      {s.error && <p role="alert" className="text-sm text-destructive">{s.error}</p>}
      <Button className="h-11 w-full" disabled={!ok || s.m.isPending}>{s.m.isPending ? 'Saving…' : 'Create account'}</Button>
    </form></DialogContent></Dialog>;
}

export function AdjustDialog({ w, periods, account, onClose }: Books & { account: NamedAccount; onClose: () => void }) {
  const adjust = useServerFn(adjustAccount); const book = useBooking({ w, periods });
  const [id] = useState(() => crypto.randomUUID()); const [target, setTarget] = useState(String(account.balance));
  const ok = /^-?\d{1,13}(\.\d{1,2})?$/.test(target) && Number(target) !== account.balance && !!book.period && !!book.branchId;
  const s = useSend(w.businessId, () => adjust({ data: { businessId: w.businessId, branchId: book.branchId, periodId: book.period!.id, id, accountId: account.id, date: book.date, target } }), onClose);
  return <Dialog open onOpenChange={o => { if (!o && !s.m.isPending) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
    <DialogHeader><DialogTitle>Adjust balance: {account.name}</DialogTitle><DialogDescription>Current balance {formatNPR(account.balance)}. Enter what it should be; the difference is recorded in your books.</DialogDescription></DialogHeader>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); s.run(); }}>
      <label className="block text-sm">Correct balance (NPR)<Input aria-label="Correct balance" className="mt-1 h-11" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} /></label>
      <DualDateInput value={book.date} onChange={book.setDate} label="Date" />
      <BranchPick b={book} />
      {!book.period && <PeriodNotice businessId={w.businessId} date={book.date} />}
      {s.error && <p role="alert" className="text-sm text-destructive">{s.error}</p>}
      <Button className="h-11 w-full" disabled={!ok || s.m.isPending}>{s.m.isPending ? 'Saving…' : 'Save adjustment'}</Button>
    </form></DialogContent></Dialog>;
}

export function TransferDialog({ w, periods, from, all, onClose }: Books & { from: NamedAccount; all: NamedAccount[]; onClose: () => void }) {
  const transfer = useServerFn(transferBetweenAccounts); const book = useBooking({ w, periods });
  const others = all.filter(a => a.isActive && a.id !== from.id);
  const [id] = useState(() => crypto.randomUUID()); const [to, setTo] = useState(others[0]?.id ?? ''); const [amount, setAmount] = useState('');
  const ok = !!to && /^\d{1,13}(\.\d{1,2})?$/.test(amount) && Number(amount) > 0 && Number(amount) <= from.balance && !!book.period && !!book.branchId;
  const s = useSend(w.businessId, () => transfer({ data: { businessId: w.businessId, branchId: book.branchId, periodId: book.period!.id, id, fromAccountId: from.id, toAccountId: to, amount, date: book.date } }), onClose);
  return <Dialog open onOpenChange={o => { if (!o && !s.m.isPending) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
    <DialogHeader><DialogTitle>Transfer from {from.name}</DialogTitle><DialogDescription>Available {formatNPR(from.balance)}. Use this to deposit cash from the safe to a bank, or move money between your accounts.</DialogDescription></DialogHeader>
    {!others.length ? <p className="text-sm text-muted-foreground">Create another account first.</p> : <form className="space-y-3" onSubmit={e => { e.preventDefault(); s.run(); }}>
      <label className="block text-sm">To<select aria-label="Transfer to" className={field} value={to} onChange={e => setTo(e.target.value)}>{others.map(a => <option key={a.id} value={a.id}>{a.name} ({kindLabel(a.kind)})</option>)}</select></label>
      <label className="block text-sm">Amount (NPR)<Input aria-label="Transfer amount" className="mt-1 h-11" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      {Number(amount) > from.balance && <p className="text-xs text-destructive">That is more than the account holds.</p>}
      <DualDateInput value={book.date} onChange={book.setDate} label="Date" />
      <BranchPick b={book} />
      {!book.period && <PeriodNotice businessId={w.businessId} date={book.date} />}
      {s.error && <p role="alert" className="text-sm text-destructive">{s.error}</p>}
      <Button className="h-11 w-full" disabled={!ok || s.m.isPending}>{s.m.isPending ? 'Moving…' : 'Transfer'}</Button>
    </form>}</DialogContent></Dialog>;
}
