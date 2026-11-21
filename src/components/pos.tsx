import { useEffect, useState } from 'react';
import './pos-workspace.css';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ArrowLeft, Building2, LogOut } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useCommerce } from './commerce-workspace';
import { DocumentEditor } from './document-editor';
import { OfflinePos } from './offline-pos';
import { supabase } from '@/integrations/supabase/client';
import { useCan } from './permission-checklist';
import { isBillingStaff } from '@/lib/workspace-navigation';
import { SaleReturnRequests } from './sale-return-requests';
import { CashCounters } from './cash-counters';
import { recordCounter } from '@/lib/commerce.functions';
import { counterInput } from '@/lib/commerce-schemas';
import { NPR_DENOMINATIONS, countedTotal, hasAnyCount, sanitizeCount, type DenominationCounts } from '@/lib/cash-denominations';
import { formatNPR } from '@/lib/format';

// POS starts with one branch-level cash counter. Once open, every authorised cashier
// bills against that session; the database still records each cashier as the actor.
export function Pos() {
  const w = useCommerce();
  const navigate = useNavigate();
  const client = useQueryClient();
  const can = useCan(w.businessId ?? '');
  const billingStaff = isBillingStaff(can);
  const manager = !!w.access.data?.manager || ['owner', 'admin', 'accountant', 'branch_manager'].includes(w.commerce.data?.role ?? '');
  const cashManager = !!w.commerce.data?.counterAccess?.canManage || ['owner', 'admin', 'accountant'].includes(w.commerce.data?.role ?? '');
  const recordCounterFn = useServerFn(recordCounter);
  const [saved, setSaved] = useState('');
  const [cashClosing, setCashClosing] = useState(false);
  const [branch, setBranch] = useState('');
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [counts, setCounts] = useState<DenominationCounts>({});
  const [setupStatus, setSetupStatus] = useState('');
  const name = w.commerce.data?.business.name ?? '';
  const ready = !!w.commerce.data && !!w.access.data && !!w.inventory.data;
  const error = w.commerce.error?.message || w.access.error?.message || w.inventory.error?.message;
  const branches = w.access.data?.branches.filter((item) => item.is_active) ?? [];
  const selectedBranch = branch || branches[0]?.id || '';
  const selectedPeriod = w.commerce.data?.periods.find((period) => period.status === 'open' && date >= period.start_date && date <= period.end_date)?.id ?? '';
  const events = w.commerce.data?.counters ?? [];
  const activeCounter = events.find((event) =>
    event.kind === 'open' && event.branch_id === selectedBranch &&
    !events.some((candidate) => candidate.session_id === event.session_id && candidate.kind === 'close')
  );
  const activeSessionId = activeCounter?.session_id ?? null;
  const counterCanOpen = !!w.commerce.data?.counterAccess?.canWrite || cashManager;
  const openingFloat = countedTotal(counts);
  const openMutation = useMutation({
    mutationFn: (request: ReturnType<typeof counterInput.parse>) => recordCounterFn({ data: request }),
    onSuccess: async () => {
      setCounts({});
      setSetupStatus('Shared branch counter opened. Billing is ready.');
      await client.invalidateQueries();
    },
    onError: (e) => setSetupStatus(e.message),
  });

  useEffect(() => {
    if (activeSessionId) {
      setSetupStatus('Shared branch counter is open. Billing is ready.');
      setCounts({});
    } else {
      setSetupStatus('');
    }
  }, [activeSessionId]);

  function setCount(denomination: number, raw: string) {
    setCounts((current) => ({ ...current, [denomination]: sanitizeCount(raw) }));
  }

  function openDay() {
    try {
      if (!hasAnyCount(counts)) {
        setSetupStatus('Enter the opening note and coin count before opening the counter.');
        return;
      }
      const request = counterInput.parse({
        id: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
        businessId: w.businessId,
        branchId: selectedBranch,
        periodId: selectedPeriod,
        date,
        kind: 'open',
        amount: openingFloat,
        reference: 'Opening cash',
      });
      openMutation.mutate(request);
    } catch (e) {
      setSetupStatus(e instanceof Error ? e.message : 'Check the opening cash count and date.');
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: '/auth', replace: true });
  }

  return <div className="pos-workspace min-h-screen bg-background">
    <header className="pos-topbar sticky top-0 z-30 grid min-h-[48px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 border-b bg-card/95 px-3 py-1 shadow-sm backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 justify-start">
        {billingStaff ? <span className="truncate text-xs font-semibold text-muted-foreground sm:text-sm">POS-only workspace</span> : <Button asChild variant="ghost" size="sm"><Link to="/dashboard"><ArrowLeft />Dashboard</Link></Button>}
      </div>
      <h1 className="max-w-[48vw] truncate text-center text-sm font-semibold sm:max-w-none sm:text-base">Point of sale</h1>
      <div className="flex min-w-0 justify-end">
        <div className="flex items-center gap-2">
          {ready && !!activeCounter && branches.length > 1 && <select aria-label="POS branch" className="h-9 max-w-32 rounded-md border bg-background px-2 text-xs sm:max-w-48 sm:text-sm" value={selectedBranch} onChange={(e) => { setBranch(e.target.value); setSaved(''); setCounts({}); setSetupStatus(''); }}><option value="" disabled>Select branch</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          {cashManager && <Button variant={cashClosing ? 'default' : 'ghost'} size="sm" onClick={() => setCashClosing((value) => !value)}>{cashClosing ? 'Back to billing' : 'Close drawer & reports'}</Button>}
          {(billingStaff || manager) && <Button variant="ghost" size="sm" onClick={() => document.getElementById('sale-return-requests')?.scrollIntoView({ behavior: 'smooth' })}>Returns</Button>}
          {billingStaff ? <Button variant="outline" size="sm" onClick={signOut}><LogOut className="size-4" /><span className="hidden sm:inline">Sign out</span></Button> : <Button asChild variant="outline" size="sm"><Link to="/sales">Sales</Link></Button>}
        </div>
      </div>
    </header>
    <main className="pos-main mx-auto w-full max-w-[1800px] px-3 py-4 sm:px-5 md:px-7 lg:px-8">
      {!w.businessId ? <section className="py-16 text-center"><Building2 className="mx-auto mb-4 size-9 text-primary" /><h2 className="text-xl font-semibold">No business linked yet</h2><Button asChild className="mt-5"><Link to="/businesses">Business setup</Link></Button></section>
        : error ? <div className="py-8"><p role="alert" className="text-sm text-destructive">{error}</p><Button className="mt-4" variant="outline" onClick={() => { w.commerce.refetch(); w.access.refetch(); w.inventory.refetch(); }}>Try again</Button></div>
        : !ready ? <p role="status" className="py-8 text-sm">Loading point of sale…</p>
        : cashClosing && cashManager ? <CashCounters embedded initialBranch={selectedBranch} />
        : !activeCounter ? <section className="mx-auto max-w-3xl rounded-xl border bg-card p-4 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Step 1 · POS setup</p>
            <h2 className="mt-2 text-xl font-semibold">Open the shared branch counter</h2>
            <p className="mt-2 text-sm text-muted-foreground">One counter is shared by authorised cashiers in this branch. Opening cash is counted once; every bill continues to record the cashier who created it.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm">Branch
                <select aria-label="POS setup branch" className="mt-2 h-11 w-full rounded-md border bg-background px-3" value={selectedBranch} onChange={(e) => { setBranch(e.target.value); setCounts({}); }}>
                  {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="text-sm">Business date
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            </div>
            <fieldset className="mt-5" disabled={openMutation.isPending || !counterCanOpen || !selectedPeriod}>
              <legend className="text-sm font-semibold">Opening cash · count notes and coins</legend>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {NPR_DENOMINATIONS.map((denomination) => (
                  <label key={denomination} className="text-sm">
                    Rs. {denomination.toLocaleString('en-IN')}
                    <Input aria-label={`Opening Rs ${denomination} count`} className="mt-1" inputMode="numeric" autoComplete="off" placeholder="0" value={counts[denomination] ?? ''} onChange={(e) => setCount(denomination, e.target.value)} />
                    <span className="mt-1 block text-xs tabular-nums text-muted-foreground">{formatNPR(denomination * (Number(counts[denomination]) || 0))}</span>
                  </label>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <span className="text-sm text-muted-foreground">Opening float</span>
                <span className="text-lg font-semibold tabular-nums">{formatNPR(openingFloat)}</span>
              </div>
            </fieldset>
            {!counterCanOpen && <p className="mt-4 rounded-md bg-secondary p-3 text-sm text-muted-foreground">Your account cannot open the branch counter. Ask an authorised cashier or manager to open it.</p>}
            {!selectedPeriod && <p className="mt-4 text-sm text-destructive">No open financial period covers this date. Ask an accountant to check the financial period.</p>}
            {setupStatus && <p role="status" className="mt-4 text-sm text-muted-foreground">{setupStatus}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={openDay} disabled={!counterCanOpen || !selectedPeriod || !hasAnyCount(counts) || openMutation.isPending || !selectedBranch}>
                {openMutation.isPending ? 'Opening counter…' : 'Open shared counter'}
              </Button>
              <Button variant="outline" onClick={() => setCounts({})} disabled={!hasAnyCount(counts) || openMutation.isPending}>Clear count</Button>
            </div>
          </section>
        : saved ? <section className="py-10"><h2 className="text-xl font-semibold">Sale saved</h2><p className="mt-3 break-all text-sm text-muted-foreground">{saved}</p><div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => setSaved('')}>New sale</Button>{!billingStaff && <Button asChild variant="outline"><Link to="/sales">Sales & receipts</Link></Button>}</div></section>
        : <DocumentEditor key={`${w.businessId}:${selectedBranch}`} w={w} kind="sale" standalone initialBranch={selectedBranch} onSaved={setSaved} />}
      {!cashClosing && ready && !error && w.businessId && <OfflinePos w={w} />}
      {!cashClosing && ready && !error && w.businessId && (billingStaff || manager) && <SaleReturnRequests w={w} manager={manager} cashier={billingStaff} />}
    </main>
  </div>;
}
