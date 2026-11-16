import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CalendarCheck, Lock, LockOpen, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPlatformOwnerStatusFn, listBusinessArchiveRequestsFn, listFiscalYears, requestBusinessArchiveFn, reviewBusinessArchiveRequestFn, setFiscalYearStatus } from '@/lib/fiscal-year.functions';
import { formatBsAd } from '@/lib/format';

const rank: Record<string, number> = { viewer: 10, staff: 20, accountant: 40, admin: 80, owner: 100 };
const badge = { open: 'bg-emerald-100 text-emerald-800', closed: 'bg-amber-100 text-amber-800', locked: 'bg-slate-200 text-slate-700' } as const;

export function FiscalYearClose({ businessId, businessName, role }: { businessId: string; businessName: string; role: string }) {
  const client = useQueryClient(); const load = useServerFn(listFiscalYears); const setStatus = useServerFn(setFiscalYearStatus);\n  const checkPlatformOwner = useServerFn(getPlatformOwnerStatusFn); const loadArchiveRequests = useServerFn(listBusinessArchiveRequestsFn);\n  const requestArchive = useServerFn(requestBusinessArchiveFn); const reviewArchive = useServerFn(reviewBusinessArchiveRequestFn);
  const [message, setMessage] = useState('');\n  const platformOwner = useQuery({ queryKey: ['platform-owner-status'], queryFn: () => checkPlatformOwner() });\n  const canSeeArchiveRequests = role === 'owner' || platformOwner.data === true;\n  const archiveRequests = useQuery({ queryKey: ['business-archive-requests', businessId], queryFn: () => loadArchiveRequests({ data: { businessId } }), enabled: Boolean(businessId) && canSeeArchiveRequests });
  const years = useQuery({ queryKey: ['fiscal-years', businessId], queryFn: () => load({ data: { businessId } }), enabled: Boolean(businessId) });
  const change = useMutation({
    mutationFn: (v: { id: string; status: 'open' | 'closed' | 'locked' }) => setStatus({ data: { periodId: v.id, status: v.status } }),
    onSuccess: () => { setMessage('Financial year updated.'); void client.invalidateQueries({ queryKey: ['fiscal-years', businessId] }); void client.invalidateQueries({ queryKey: ['commerce', businessId] }); },
    onError: e => setMessage(e.message),
  });
  const archiveRequestMutation = useMutation({
    mutationFn: (reason: string) => requestArchive({ data: { businessId, reason } }),
    onSuccess: () => { setMessage('Archive request sent to the Master Owner for review.'); void client.invalidateQueries({ queryKey: ['business-archive-requests', businessId] }); },
    onError: e => setMessage(e.message),
  });
  const archiveReviewMutation = useMutation({
    mutationFn: (v: { requestId: string; approve: boolean; note?: string }) => reviewArchive({ data: v }),
    onSuccess: (_result, variables) => {
      if (variables.approve) { void client.clear(); window.location.assign('/dashboard'); return; }
      setMessage('Archive request rejected. The business remains active.');
      void client.invalidateQueries({ queryKey: ['business-archive-requests', businessId] });
    },
    onError: e => setMessage(e.message),
  });
  const r = rank[role] ?? 0;
  if (r < rank['accountant']!) return null;
  const run = (id: string, name: string, status: 'open' | 'closed' | 'locked', warning: string) => { if (window.confirm(`${warning}\n\nFinancial year: ${name}`)) change.mutate({ id, status }); };
  return <section className="mt-6"><h2 className="mb-2 text-sm font-medium text-muted-foreground">Financial year</h2>
    <div className="divide-y rounded-2xl border bg-card">
      {years.isPending && <p className="px-4 py-4 text-sm text-muted-foreground">Loading…</p>}
      {years.error && <p role="alert" className="px-4 py-4 text-sm text-destructive">{years.error.message}</p>}
      {years.data?.length === 0 && <p className="px-4 py-4 text-sm text-muted-foreground">No financial year has been created yet. One is created automatically with your first invoice.</p>}
      {years.data?.map(y => <div key={y.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
        <CalendarCheck className="size-5 text-muted-foreground" />
        <div className="min-w-0 flex-1"><p className="truncate text-base">{y.name}</p><p className="text-xs text-muted-foreground">{formatBsAd(y.start_date)} — {formatBsAd(y.end_date)}</p></div>
        <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${badge[y.status]}`}>{y.status}</span>
        {y.status === 'open' && <Button size="sm" variant="outline" disabled={change.isPending} onClick={() => run(y.id, y.name, 'closed', 'Close this financial year? Nobody can add or edit records dated inside it until it is reopened.')}><Lock />Close</Button>}
        {y.status === 'closed' && r >= rank['admin']! && <Button size="sm" variant="outline" disabled={change.isPending} onClick={() => run(y.id, y.name, 'open', 'Reopen this financial year? Records inside it can be changed again.')}><LockOpen />Reopen</Button>}
        {y.status === 'closed' && r >= rank['owner']! && <Button size="sm" variant="outline" disabled={change.isPending} onClick={() => run(y.id, y.name, 'locked', 'Permanently lock this financial year? A locked year can NEVER be reopened or edited.')}>Lock forever</Button>}
      </div>)}
    </div>
    {message && <p role="status" className="mt-2 text-sm">{message}</p>}
    <p className="mt-2 text-xs text-muted-foreground">Balances carry forward automatically from earlier records, so closing a year does not change any balance.</p>
    {archiveRequests.error && canSeeArchiveRequests && <p role="alert" className="mt-3 text-sm text-destructive">{archiveRequests.error.message}</p>}
    {role === 'owner' && platformOwner.data === false && !archiveRequests.data?.some(x => x.status === 'pending') && <Button variant="outline" className="mt-4 text-destructive" disabled={archiveRequestMutation.isPending} onClick={() => { const reason = window.prompt(`Why are you requesting to archive "${businessName}"?`); if (reason?.trim()) archiveRequestMutation.mutate(reason.trim()); }}><Archive />Request business archiving</Button>}
    {role === 'owner' && platformOwner.data === false && archiveRequests.data?.some(x => x.status === 'pending') && <p className="mt-4 text-sm text-amber-700">Business archiving request is pending Master Owner approval.</p>}
    {platformOwner.data === true && <div className="mt-5 rounded-xl border p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4" />Master Owner review</h3>
      {archiveRequests.isPending && <p className="mt-2 text-sm text-muted-foreground">Loading archive requests…</p>}
      {!archiveRequests.isPending && !archiveRequests.data?.some(x => x.status === 'pending') && <p className="mt-2 text-sm text-muted-foreground">No pending archive requests for this business.</p>}
      {archiveRequests.data?.filter(x => x.status === 'pending').map(x => <div key={x.id} className="mt-3 border-t pt-3">
        <p className="text-sm">{x.request_reason}</p>
        <p className="mt-1 text-xs text-muted-foreground">Requested {new Date(x.created_at).toLocaleString()}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="destructive" disabled={archiveReviewMutation.isPending} onClick={() => { if (window.confirm(`Approve archiving "${businessName}"? It will be removed from active business lists.`)) archiveReviewMutation.mutate({ requestId: x.id, approve: true }); }}>Approve & archive</Button>
          <Button size="sm" variant="outline" disabled={archiveReviewMutation.isPending} onClick={() => { const note = window.prompt('Optional reason for rejecting this request:'); if (note !== null) archiveReviewMutation.mutate({ requestId: x.id, approve: false, note }); }}>Reject request</Button>
        </div>
      </div>)}
    </div>}
  </section>;
}
