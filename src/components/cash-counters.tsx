import { useEffect, useState } from 'react';
import Decimal from 'decimal.js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { CommerceFrame, useCommerce } from './commerce-workspace';
import { recordCounter } from '@/lib/commerce.functions';
import { counterInput } from '@/lib/commerce-schemas';
import { formatNPR } from '@/lib/format';
import {
  NPR_DENOMINATIONS,
  countedTotal,
  hasAnyCount,
  sanitizeCount,
  type DenominationCounts,
} from '@/lib/cash-denominations';
import { canSeeExpectedCash } from '@/lib/cash-counter-access';
import { PeriodNotice } from './period-notice';

type CounterKind = 'open' | 'in' | 'out' | 'close';

const EVENT_LABEL: Record<CounterKind, string> = {
  open: 'Open counter',
  close: 'Close & count cash',
  in: 'Cash in',
  out: 'Cash out',
};

const HISTORY_LABEL: Record<CounterKind, string> = {
  open: 'Counter opened',
  close: 'Counter closed',
  in: 'Cash in',
  out: 'Cash out',
};

const dec = (value: unknown) => new Decimal(Number(value) || 0);

/** Closing difference is counted minus expected, so negative means short and positive means over. */
function Difference({ value }: { value: unknown }) {
  const n = Number(value) || 0;
  if (n === 0) return <span>Balanced</span>;
  return (
    <span className={n < 0 ? 'font-medium text-destructive' : 'font-medium text-amber-600'}>
      {n < 0 ? 'Short' : 'Over'} {formatNPR(Math.abs(n))}
    </span>
  );
}

export function CashCounters() {
  const w = useCommerce();
  const client = useQueryClient();
  const fn = useServerFn(recordCounter);
  const [branch, setBranch] = useState('');
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [kind, setKind] = useState<CounterKind>('open');
  const [amount, setAmount] = useState('');
  const [counts, setCounts] = useState<DenominationCounts>({});
  const [reference, setReference] = useState('');
  const [status, setStatus] = useState('');
  const [request, setRequest] = useState<ReturnType<typeof counterInput.parse> | null>(null);

  const data = w.commerce.data;
  const branches = w.access.data?.branches.filter((b) => b.is_active) ?? [];
  const selectedBranch = branch || branches[0]?.id || '';
  const selectedPeriod =
    data?.periods.find((p) => p.status === 'open' && date >= p.start_date && date <= p.end_date)?.id || '';
  const events = data?.counters ?? [];
  const own = events.find(
    (e) =>
      e.kind === 'open' &&
      e.actor_id === data?.userId &&
      !events.some((c) => c.session_id === e.session_id && c.kind === 'close'),
  );
  const manager = ['owner', 'admin'].includes(data?.role ?? '');
  const canWrite = ['owner', 'admin', 'accountant', 'staff'].includes(data?.role ?? '');
  // Staff count blind: no expected figure while a counter is open. The close result (expected and
  // difference) still appears in the history once they submit.
  const showExpected = canSeeExpectedCash(data?.role);

  // Preview only; the server recomputes expected cash when the counter is closed.
  const expected = own
    ? events
        .filter((e) => e.session_id === own.session_id)
        .reduce(
          (sum, e) =>
            sum.plus(['open', 'in'].includes(e.kind) ? dec(e.amount) : e.kind === 'out' ? dec(e.amount).neg() : 0),
          new Decimal(0),
        )
        .plus(
          (data?.payments ?? [])
            .filter((p) => p.session_id === own.session_id && p.method === 'cash')
            .reduce((sum, p) => sum.plus(p.direction === 'in' ? dec(p.amount) : dec(p.amount).neg()), new Decimal(0)),
        )
    : null;

  const dailySessions = events
    .filter((event) => event.kind === 'open' && event.event_date === date)
    .map((opening) => {
      const sessionEvents = events.filter((event) => event.session_id === opening.session_id);
      const sessionPayments = (data?.payments ?? []).filter(
        (payment) => payment.session_id === opening.session_id && payment.method === 'cash',
      );
      const cashIn = sessionEvents.filter((event) => event.kind === 'in').reduce((sum, event) => sum.plus(event.amount), new Decimal(0));
      const cashOut = sessionEvents.filter((event) => event.kind === 'out').reduce((sum, event) => sum.plus(event.amount), new Decimal(0));
      const receipts = sessionPayments.filter((payment) => payment.direction === 'in').reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));
      const refunds = sessionPayments.filter((payment) => payment.direction === 'out').reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));
      const closing = sessionEvents.find((event) => event.kind === 'close');
      const calculatedExpected = dec(opening.amount).plus(cashIn).minus(cashOut).plus(receipts).minus(refunds);
      const expectedClosing = closing ? dec(closing.expected) : calculatedExpected;
      const closingActor = closing?.actor_id;
      const staffName = (actorId: string | null | undefined) => {
        if (!actorId) return 'Unknown staff';
        const member = (w.access.data?.members ?? []).find((item) => item.user_id === actorId);
        const profile = Array.isArray(member?.profiles) ? member.profiles[0] : member?.profiles;
        return profile?.full_name || (actorId === data?.userId ? 'You' : 'Staff member');
      };
      return {
        id: opening.session_id,
        openedBy: staffName(opening.actor_id),
        closedBy: closingActor ? staffName(closingActor) : null,
        branch: w.access.data?.branches.find((item) => item.id === opening.branch_id)?.name ?? 'Branch',
        opening: dec(opening.amount),
        cashIn,
        cashOut,
        receipts,
        refunds,
        expected: expectedClosing,
        actual: closing ? dec(closing.amount) : null,
        difference: closing ? dec(closing.difference) : null,
        closed: !!closing,
      };
    });

  const countable = kind === 'open' || kind === 'close';
  const hasCounts = hasAnyCount(counts);

  useEffect(() => {
    setKind(own ? 'close' : 'open');
  }, [own?.session_id]);

  useEffect(() => {
    setRequest(null);
    setBranch('');
    setAmount('');
    setCounts({});
    setStatus('');
  }, [w.businessId]);

  const mutation = useMutation({
    mutationFn: (r: ReturnType<typeof counterInput.parse>) => fn({ data: r }),
    onSuccess: async () => {
      setRequest(null);
      setAmount('');
      setCounts({});
      setReference('');
      setStatus('Counter event confirmed.');
      await client.invalidateQueries();
    },
    onError: (e) => setStatus(e.message),
  });

  function setCount(denomination: number, raw: string) {
    const next = { ...counts, [denomination]: sanitizeCount(raw) };
    setCounts(next);
    setAmount(hasAnyCount(next) ? countedTotal(next).toFixed(2) : '');
  }

  function clearCount() {
    setCounts({});
    setAmount('');
  }

  function changeKind(next: CounterKind) {
    setKind(next);
    if (hasCounts) clearCount();
  }

  function submit() {
    try {
      const r = counterInput.parse({
        id: crypto.randomUUID(),
        sessionId: kind === 'open' ? crypto.randomUUID() : own?.session_id,
        businessId: w.businessId,
        branchId: kind === 'open' ? selectedBranch : own?.branch_id,
        periodId: selectedPeriod,
        date,
        kind,
        amount: Number(amount),
        reference,
      });
      setRequest(r);
      mutation.mutate(r);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Check counter details.');
    }
  }

  return (
    <CommerceFrame w={w} title="Cash counters" active="/cash-counters">
      <section className="border-b py-7">
        <h2 className="brand text-xl">Your counter</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {own ? `Open · ${w.access.data?.branches.find((b) => b.id === own.branch_id)?.name}` : 'No open counter'}
        </p>
        {showExpected ? (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">Expected cash in drawer</p>
            <p className="text-3xl font-semibold tabular-nums">
              {expected === null ? '—' : formatNPR(expected.toString())}
            </p>
          </div>
        ) : own ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Count the cash in your drawer and enter it below to close. The expected amount is shown after you submit.
          </p>
        ) : null}
        {canWrite && (
          <form
            className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (request) mutation.mutate(request);
              else if (window.confirm(`Confirm counter ${kind}?`)) submit();
            }}
          >
            <label className="text-sm">
              Event
              <select
                aria-label="Counter event"
                disabled={!!request}
                className="mt-2 h-10 w-full rounded-md border bg-card px-3"
                value={kind}
                onChange={(e) => changeKind(e.target.value as CounterKind)}
              >
                {(own ? (manager ? ['close', 'in', 'out'] : ['close']) : ['open']).map((k) => (
                  <option key={k} value={k}>
                    {EVENT_LABEL[k as CounterKind]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Branch
              <select
                aria-label="Counter branch"
                disabled={!!request || !!own}
                className="mt-2 h-10 w-full rounded-md border bg-card px-3"
                value={own?.branch_id || selectedBranch}
                onChange={(e) => setBranch(e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Date
              <Input type="date" disabled={!!request} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            {countable && (
              <fieldset className="sm:col-span-2 xl:col-span-3" disabled={!!request}>
                <legend className="text-sm font-medium">Count notes and coins</legend>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {NPR_DENOMINATIONS.map((d) => (
                    <label key={d} className="text-sm">
                      Rs. {d.toLocaleString('en-IN')}
                      <Input
                        aria-label={`Rs ${d} count`}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="0"
                        value={counts[d] ?? ''}
                        onChange={(e) => setCount(d, e.target.value)}
                      />
                      <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                        {formatNPR(d * (Number(counts[d]) || 0))}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <p>
                    Total counted <span className="font-semibold tabular-nums">{formatNPR(countedTotal(counts))}</span>
                  </p>
                  {hasCounts && (
                    <Button type="button" variant="outline" size="sm" onClick={clearCount}>
                      Clear count
                    </Button>
                  )}
                </div>
              </fieldset>
            )}
            <label className="text-sm">
              {kind === 'close' ? 'Counted closing cash' : 'Amount'}
              <Input
                aria-label="Counter amount"
                required
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                readOnly={hasCounts}
                disabled={!!request}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            {kind === 'close' && own && amount !== '' && Number.isFinite(Number(amount)) && (
              <section aria-label="Closing cash summary" className="sm:col-span-2 xl:col-span-3 rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold">Closing reconciliation</h3>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {showExpected && expected !== null ? (
                    <>
                      <div>
                        <p className="text-xs text-muted-foreground">Expected cash</p>
                        <p className="mt-1 font-semibold tabular-nums">{formatNPR(expected.toString())}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Actual cash counted</p>
                        <p className="mt-1 font-semibold tabular-nums">{formatNPR(amount)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Difference</p>
                        <p className="mt-1 font-semibold tabular-nums">
                          <Difference value={dec(amount).minus(expected).toString()} />
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="col-span-2 sm:col-span-3">
                      <p className="text-sm">Your closing count is recorded. Expected cash and any difference will be available after submission.</p>
                      <p className="mt-1 text-xs text-muted-foreground">Blind count protects the accuracy of the drawer handover.</p>
                    </div>
                  )}
                </div>
              </section>
            )}
            <label className="text-sm">
              Reference / reason
              <Input
                required
                maxLength={200}
                disabled={!!request}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <Button className="w-fit" disabled={mutation.isPending || !selectedPeriod}>
              {request ? 'Retry same event' : 'Confirm counter event'}
            </Button>
            {!!data && !selectedPeriod && (
              <div className="sm:col-span-2 xl:col-span-3">
                <PeriodNotice businessId={w.businessId} date={date} />
              </div>
            )}
          </form>
        )}
      </section>
      <section className="border-b py-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="brand text-xl">Daily cash closing report</h2>
            <p className="mt-1 text-sm text-muted-foreground">Cash activity by counter session, using confirmed counter events and cash payments only.</p>
          </div>
          <label className="text-sm">Report date
            <Input aria-label="Cash closing report date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        {!dailySessions.length ? (
          <p className="py-6 text-sm text-muted-foreground">No counter sessions opened on this date.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {dailySessions.map((session) => (
              <article key={session.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{session.branch}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Opened by {session.openedBy}{session.closedBy ? ` · Closed by ${session.closedBy}` : ''}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{session.closed ? 'Closed' : 'Open'}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                  {[
                    ['Opening cash', session.opening],
                    ['Cash sales / receipts', session.receipts],
                    ['Refunds paid', session.refunds],
                    ['Cash in', session.cashIn],
                    ['Cash out', session.cashOut],
                    ['Expected closing', session.expected],
                    ...(session.actual ? [['Actual counted', session.actual] as [string, Decimal]] : []),
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 font-semibold tabular-nums">{formatNPR(value.toString())}</p>
                    </div>
                  ))}
                  {session.closed && session.difference !== null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Difference</p>
                      <p className="mt-1 font-semibold tabular-nums"><Difference value={session.difference.toString()} /></p>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="py-7">
        <h2 className="brand mb-5 text-xl">Counter history</h2>
        {!events.length ? (
          <p className="py-8 text-sm text-muted-foreground">No counter events yet.</p>
        ) : (
          <div className="divide-y">
            {events.map((e) => (
              <article key={e.id} className="flex flex-wrap justify-between gap-3 py-4 text-sm">
                <div>
                  <p className="font-medium">
                    {HISTORY_LABEL[e.kind as CounterKind] ?? e.kind} · {e.reference}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.event_date} · {w.access.data?.branches.find((b) => b.id === e.branch_id)?.name}
                    {' · '}{(() => {
                      const member = (w.access.data?.members ?? []).find((item) => item.user_id === e.actor_id);
                      const profile = Array.isArray(member?.profiles) ? member.profiles[0] : member?.profiles;
                      return profile?.full_name || (e.actor_id === data?.userId ? 'You' : 'Staff member');
                    })()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular-nums">{formatNPR(e.amount)}</p>
                  {e.kind === 'close' && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Expected {formatNPR(e.expected)} · <Difference value={e.difference} />
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {status && (
        <p role="status" className="mt-5 border-l-2 border-primary pl-3 text-sm">
          {status}
        </p>
      )}
    </CommerceFrame>
  );
}
