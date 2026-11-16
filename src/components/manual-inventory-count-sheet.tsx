import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Download, FileSpreadsheet, FileText, ClipboardList } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { makeCsv } from '@/lib/inventory-csv';
import { downloadCsv } from '@/lib/download-csv';
import { stockBalances } from '@/lib/inventory-schemas';
import { createInventoryCountSession, updateInventoryCountSession, listInventoryCountSessions, readInventoryCountSession, submitInventoryCountSession, reviewInventoryCountSession } from '@/lib/inventory.functions';

type Variant = { id: string; sku: string; barcode?: string | null; name: string; unit: string; purchase_price?: number | string | null; is_active: boolean; products?: { name?: string; is_active?: boolean | null } | null };
type Branch = { id: string; name: string; is_active: boolean };
type Movement = { variant_id: string; branch_id: string; quantity: number };
const formatQuantity = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));

type Props = { variants: Variant[]; branches: Branch[]; movements: Movement[]; businessId: string; manager: boolean; currentUserId?: string; canViewPurchasePrice: boolean };

type DraftRow = { physical: string; cost: string; system?: number; sku?: string; product?: string; variant?: string; unit?: string };
type SessionSummary = { id: string; branch_id: string; branch_name: string; count_date: string; counted_by: string; status: 'draft'|'submitted'|'approved'|'rejected'; created_by: string; created_at: string; submitted_at: string | null; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null; line_count: number; counted_line_count: number };
type SavedCountDetail = { session: { id: string; branch_id: string; count_date: string; counted_by: string; status: SessionSummary['status'] }; lines: { variant_id: string; sku: string; product: string; variant: string; unit: string; system_quantity: number; physical_quantity: number | null; cost_price: number | null; note: string | null }[] };

export function ManualInventoryCountSheet({ variants, branches, movements, businessId, manager, currentUserId, canViewPurchasePrice }: Props) {
  const [branchId, setBranchId] = useState('');
  const [countedBy, setCountedBy] = useState('');
  const [countDate, setCountDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [status, setStatus] = useState('');
  const [scanCode, setScanCode] = useState('');
  const [scanFeedback, setScanFeedback] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionVariantIds, setSessionVariantIds] = useState<string[] | null>(null);
  const [activeSessionStatus, setActiveSessionStatus] = useState<SessionSummary['status'] | null>(null);
  const queryClient = useQueryClient();
  const createSession = useServerFn(createInventoryCountSession);
  const updateSession = useServerFn(updateInventoryCountSession);
  const listSessions = useServerFn(listInventoryCountSessions);
  const readSession = useServerFn(readInventoryCountSession);
  const submitSession = useServerFn(submitInventoryCountSession);
  const reviewSession = useServerFn(reviewInventoryCountSession);
  const sessionsQuery = useQuery({
    queryKey: ['inventory-count-sessions', businessId],
    queryFn: async () => (await listSessions({ data: { businessId } })) as SessionSummary[],
    enabled: !!businessId,
  });
  useEffect(() => {
    setBranchId('');
    setCountedBy('');
    setCountDate(new Date().toISOString().slice(0,10));
    setDrafts({});
    setActiveSessionId(null);
    setSessionVariantIds(null);
    setActiveSessionStatus(null);
    setStatus('');
  }, [businessId]);
  const activeBranches = branches.filter(b => b.is_active);
  const selectedBranch = activeBranches.find(b => b.id === branchId) ?? activeBranches[0];
  const balances = useMemo(() => stockBalances(movements), [movements]);
  const rows = variants.filter(v => sessionVariantIds ? sessionVariantIds.includes(v.id) : v.is_active && v.products?.is_active !== false).map(v => {
    const key = `${selectedBranch?.id ?? ''}:${v.id}`;
    const draft = drafts[key] ?? { physical: '', cost: canViewPurchasePrice ? String(Number(v.purchase_price ?? 0)) : '' };
    const costValue = draft.cost.trim() === '' && canViewPurchasePrice ? String(Number(v.purchase_price ?? 0)) : draft.cost;
    const system = draft.system ?? balances.get(key) ?? 0;
    const counted = draft.physical.trim() === '' ? null : Number(draft.physical);
    const cost = costValue.trim() === '' ? null : Number(costValue);
    const validPhysical = counted !== null && Number.isInteger(counted) && counted >= 0;
    const validCost = !canViewPurchasePrice || (cost !== null && Number.isFinite(cost) && cost >= 0);
    const difference = validPhysical ? counted - system : null;
    return { key, id: v.id, sku: draft.sku ?? v.sku, product: draft.product ?? v.products?.name ?? 'Product', variant: draft.variant ?? v.name, unit: draft.unit ?? v.unit, system, physical: validPhysical ? counted : null, cost: canViewPurchasePrice && validCost ? cost : null, difference, valueDifference: validPhysical && canViewPurchasePrice && validCost && cost !== null ? (counted - system) * cost : null, physicalValue: validPhysical && canViewPurchasePrice && validCost && cost !== null ? counted * cost : null, systemValue: canViewPurchasePrice && validCost && cost !== null ? system * cost : null, invalid: (draft.physical.trim() !== '' && !validPhysical) || (canViewPurchasePrice && !validCost) };
  });
  const enteredRows = rows.filter(r => r.physical !== null);
  const totalSystemValue = canViewPurchasePrice ? rows.reduce((sum, r) => sum + (r.systemValue ?? 0), 0) : null;
  const totalPhysicalValue = canViewPurchasePrice ? enteredRows.reduce((sum, r) => sum + (r.physicalValue ?? 0), 0) : null;
  const totalDifference = enteredRows.reduce((sum, r) => sum + (r.difference ?? 0), 0);
  const totalValueDifference = canViewPurchasePrice ? enteredRows.reduce((sum, r) => sum + (r.valueDifference ?? 0), 0) : null;
  const canExport = !!countedBy.trim() && !!selectedBranch && enteredRows.length > 0 && rows.every(r => !r.invalid);
  const persistCount = async () => {
    if (!selectedBranch || !countedBy.trim()) throw new Error('Select a branch and enter the team member name.');
    if (rows.some(r => r.invalid)) throw new Error('Correct invalid physical quantities before saving.');
    const lines = rows.map(r => ({ variantId: r.id, physicalQuantity: r.physical, costPrice: r.cost, note: '' }));
    if (lines.some(line => !line.variantId)) throw new Error('A product could not be matched. Refresh the inventory and try again.');
    if (activeSessionId) {
      await updateSession({ data: { sessionId: activeSessionId, countDate, countedBy: countedBy.trim(), lines } });
      return activeSessionId;
    }
    const created = await createSession({ data: { businessId, branchId: selectedBranch.id, countDate, countedBy: countedBy.trim(), lines } });
    setActiveSessionId(created.sessionId);
    return created.sessionId;
  };
  const saveMutation = useMutation({
    mutationFn: persistCount,
    onSuccess: async () => {
      setActiveSessionStatus('draft');
      setStatus('Draft saved. You can reopen it from count history.');
      await queryClient.invalidateQueries({ queryKey: ['inventory-count-sessions', businessId] });
    },
    onError: e => setStatus(e instanceof Error ? e.message : 'Draft could not be saved.'),
  });
  const submitMutation = useMutation({
    mutationFn: async () => {
      const sessionId = await persistCount();
      await submitSession({ data: { sessionId } });
      return sessionId;
    },
    onSuccess: async sessionId => {
      setActiveSessionId(sessionId);
      setActiveSessionStatus('submitted');
      setStatus('Count submitted for administrator review. It will not change stock.');
      await queryClient.invalidateQueries({ queryKey: ['inventory-count-sessions', businessId] });
    },
    onError: e => setStatus(e instanceof Error ? e.message : 'Count could not be submitted.'),
  });
  const reviewMutation = useMutation({
    mutationFn: (input: { sessionId: string; decision: 'approved'|'rejected'; note?: string }) => reviewSession({ data: input }),
    onSuccess: async (_result, input) => {
      setStatus(input.decision === 'approved' ? 'Inventory count approved.' : 'Inventory count rejected.');
      await queryClient.invalidateQueries({ queryKey: ['inventory-count-sessions', businessId] });
      if (activeSessionId === input.sessionId) setActiveSessionStatus(input.decision);
    },
    onError: e => setStatus(e instanceof Error ? e.message : 'Review could not be saved.'),
  });
  const openSavedSession = async (sessionId: string) => {
    try {
      const raw = await readSession({ data: { sessionId } });
      const detail = raw as unknown as SavedCountDetail;
      setBranchId(detail.session.branch_id);
      setCountDate(detail.session.count_date);
      setCountedBy(detail.session.counted_by);
      setActiveSessionId(detail.session.id);
      setSessionVariantIds(detail.lines.map(line => line.variant_id));
      setActiveSessionStatus(detail.session.status);
      setDrafts(Object.fromEntries(detail.lines.map(line => [`${detail.session.branch_id}:${line.variant_id}`, {
        physical: line.physical_quantity === null ? '' : String(line.physical_quantity),
        cost: line.cost_price === null ? (canViewPurchasePrice ? String(Number(variants.find(v => v.id === line.variant_id)?.purchase_price ?? 0)) : '') : String(line.cost_price),
        system: Number(line.system_quantity), sku: line.sku, product: line.product, variant: line.variant, unit: line.unit,
      }])));
      setStatus('Saved count opened.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Saved count could not be opened.');
    }
  };
  const update = (key: string, field: keyof DraftRow, value: string) => {
    setDrafts(current => ({ ...current, [key]: { ...(current[key] ?? { physical: '', cost: '' }), [field]: value } }));
    setStatus('');
  };
  const scanInventoryBarcode = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    if (!selectedBranch) { setScanFeedback('Select a branch before scanning.'); return; }
    if (activeSessionStatus !== null && activeSessionStatus !== 'draft') { setScanFeedback('This count is locked. Start a new count to scan more products.'); return; }
    const normalized = code.toLocaleLowerCase();
    const match = variants.find(v => v.is_active && v.products?.is_active !== false && [v.barcode, v.sku].some(value => value?.trim().toLocaleLowerCase() === normalized));
    if (!match) { setScanFeedback(`No active product matches barcode or SKU “${code}”. Check the product barcode in the catalogue.`); return; }
    const key = `${selectedBranch.id}:${match.id}`;
    const currentValue = drafts[key]?.physical ?? '';
    const currentQuantity = currentValue.trim() === '' ? 0 : Number(currentValue);
    if (!Number.isFinite(currentQuantity) || currentQuantity < 0) { setScanFeedback(`Correct the physical quantity for ${match.sku} before scanning it again.`); return; }
    const nextQuantity = currentQuantity + 1;
    setDrafts(current => ({ ...current, [key]: { ...(current[key] ?? { physical: '', cost: canViewPurchasePrice ? String(Number(match.purchase_price ?? 0)) : '' }), physical: String(nextQuantity) } }));
    setSessionVariantIds(current => current ? (current.includes(match.id) ? current : [...current, match.id]) : null);
    setScanFeedback(`Added ${match.products?.name ?? match.name} · ${match.name} (${match.sku}) — physical count: ${nextQuantity} ${match.unit}.`);
    setStatus('');
  };
  const exportRows = rows.map(r => ({ sku: r.sku, product: r.product, variant: r.variant, branch: selectedBranch?.name ?? '', system_quantity: r.system, physical_quantity: r.physical ?? '', variance: r.difference ?? '', cost_price: r.cost ?? '', system_stock_value: r.systemValue?.toFixed(2) ?? '', physical_stock_value: r.physicalValue?.toFixed(2) ?? '', difference_value: r.valueDifference?.toFixed(2) ?? '', counted_by: countedBy.trim(), count_date: countDate }));
  const exportCsv = () => {
    if (!canExport) { setStatus('Enter the team member name and at least one physical quantity. Correct invalid values before exporting.'); return; }
    downloadCsv(`inventory-count-${countDate}.csv`, makeCsv(exportRows, ['count_date','counted_by','branch','sku','product','variant','system_quantity','physical_quantity','variance','cost_price','system_stock_value','physical_stock_value','difference_value']));
    setStatus('CSV report exported.');
  };
  const exportPdf = () => {
    if (!canExport) { setStatus('Enter the team member name and at least one physical quantity. Correct invalid values before exporting.'); return; }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(16); doc.text('Physical Inventory Count', 14, 15);
    doc.setFontSize(9); doc.text(`Business inventory count | Branch: ${selectedBranch?.name} | Date: ${countDate} | Counted by: ${countedBy.trim()}`, 14, 22);
    autoTable(doc, { startY: 28, head: [['SKU','Product / Variant','System Qty','Physical Qty','Variance','Cost Price','System Value','Physical Value','Difference (Value)']], body: rows.map(r => [r.sku, `${r.product} / ${r.variant}`, formatQuantity(r.system), r.physical === null ? '—' : formatQuantity(r.physical), r.difference === null ? '—' : formatQuantity(r.difference), r.cost === null ? '—' : r.cost.toFixed(2), r.systemValue === null ? '—' : r.systemValue.toFixed(2), r.physicalValue === null ? '—' : r.physicalValue.toFixed(2), r.valueDifference === null ? '—' : r.valueDifference.toFixed(2)]), styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [35, 55, 75] }, didDrawPage: () => { doc.setFontSize(8); doc.text('BizSathi Nepal · Physical count worksheet', 14, 200); } });
    const y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 30;
    doc.setFontSize(9); doc.text(`System stock value: ${totalSystemValue === null ? '—' : totalSystemValue.toFixed(2)}    Physical stock value (entered rows): ${totalPhysicalValue === null ? '—' : totalPhysicalValue.toFixed(2)}    Net quantity variance: ${formatQuantity(totalDifference)}    Difference value (shortage − / surplus +): ${totalValueDifference === null ? '—' : totalValueDifference.toFixed(2)}`, 14, Math.min(y + 8, 195));
    doc.save(`inventory-count-${countDate}.pdf`);
    setStatus('PDF report exported.');
  };
  return <section className="mt-7 rounded-xl border bg-card p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="size-5"/></span><div><h2 className="brand text-xl">Manual inventory count sheet</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Count products against the live stock ledger and enter physical quantities. Cost price is read-only and comes from the product's saved purchase price. This worksheet does not adjust stock.</p></div></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!canExport} onClick={exportCsv}><FileSpreadsheet className="size-4"/>Export CSV</Button><Button variant="outline" disabled={!canExport} onClick={exportPdf}><FileText className="size-4"/>Export PDF</Button></div>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button variant="outline" disabled={saveMutation.isPending || submitMutation.isPending || (activeSessionStatus !== null && activeSessionStatus !== 'draft')} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? 'Saving…' : activeSessionId ? 'Update saved draft' : 'Save draft'}</Button>
      <Button disabled={submitMutation.isPending || saveMutation.isPending || (activeSessionStatus !== null && activeSessionStatus !== 'draft') || !countedBy.trim() || enteredRows.length === 0} onClick={() => submitMutation.mutate()}>{submitMutation.isPending ? 'Submitting…' : 'Submit for review'}</Button>
      {activeSessionId && <span className="text-xs text-muted-foreground">Session {activeSessionId.slice(0,8)} · {activeSessionStatus ?? 'new draft'}</span>}
      {activeSessionId && <Button size="sm" variant="ghost" onClick={() => { setActiveSessionId(null); setSessionVariantIds(null); setActiveSessionStatus(null); setDrafts({}); setCountedBy(''); setCountDate(new Date().toISOString().slice(0,10)); }}>New count</Button>}
    </div>
    <div className="mt-5 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Saved count history</h3><Button size="sm" variant="ghost" onClick={() => sessionsQuery.refetch()}>Refresh</Button></div>
      {sessionsQuery.isPending ? <p className="py-3 text-sm text-muted-foreground">Loading count history…</p> : sessionsQuery.error ? <p className="py-3 text-sm text-destructive">Count history could not be loaded.</p> : !sessionsQuery.data?.length ? <p className="py-3 text-sm text-muted-foreground">No saved inventory counts yet.</p> : <div className="mt-2 divide-y">{sessionsQuery.data.map(session => <article key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
        <button type="button" className="min-w-0 text-left hover:underline" onClick={() => void openSavedSession(session.id)}><span className="font-medium">{session.branch_name} · {session.count_date}</span><span className="block text-xs text-muted-foreground">{session.counted_by} · {session.counted_line_count}/{session.line_count} counted · {session.status}</span></button>
        <div className="flex flex-wrap items-center gap-2">
          {manager && session.status === 'submitted' && session.created_by !== currentUserId && <><Button size="sm" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({sessionId:session.id,decision:'approved'})}>Approve</Button><Button size="sm" variant="outline" disabled={reviewMutation.isPending} onClick={() => { const note = window.prompt('Reason for rejecting this count (required):'); if (note?.trim()) reviewMutation.mutate({sessionId:session.id,decision:'rejected',note}); }}>Reject</Button></>}
          <span className="rounded-full bg-muted px-2 py-1 text-xs capitalize">{session.status}</span>
        </div>
      </article>)}</div>}
    </div>
    {!canViewPurchasePrice && <p role="status" className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">Purchase price access is currently restricted. Ask the business owner to open Team → Users → Edit permissions and keep “See Purchase Price” enabled for this team member. Cost and stock values will appear after access is enabled and the inventory is refreshed.</p>}
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <label className="text-sm">Branch<select aria-label="Count branch" disabled={!!activeSessionId} className="mt-2 h-10 w-full rounded-md border bg-card px-3" value={selectedBranch?.id ?? ''} onChange={e => setBranchId(e.target.value)}><option value="">Select branch</option>{activeBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="text-sm">Inventory count date<Input type="date" value={countDate} onChange={e => setCountDate(e.target.value)}/></label>
      <label className="text-sm">Counted by (team member)<Input required maxLength={120} placeholder="Enter team member name" value={countedBy} onChange={e => setCountedBy(e.target.value)}/></label>
    </div>
    <div className="mt-5 rounded-lg border bg-muted/20 p-3">
      <label className="block text-sm font-medium" htmlFor="inventory-count-barcode">Scan product barcode or SKU</label>
      <p className="mt-1 text-xs text-muted-foreground">Use a USB or Bluetooth barcode scanner in keyboard mode. Scan each unit once; the physical quantity increases by one per scan. You can still edit the quantity manually.</p>
      <Input id="inventory-count-barcode" aria-label="Scan product barcode or SKU" className="mt-2 sm:max-w-md" value={scanCode} placeholder="Scan here, then press Enter" autoComplete="off" disabled={!selectedBranch || (activeSessionStatus !== null && activeSessionStatus !== 'draft')} onChange={e => setScanCode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); scanInventoryBarcode(scanCode); setScanCode(''); } }} />
      {scanFeedback && <p role="status" className="mt-2 text-sm">{scanFeedback}</p>}
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Products counted</p><p className="mt-1 text-xl font-semibold tabular-nums">{enteredRows.length} / {rows.length}</p></div>
      <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">System stock value</p><p className="mt-1 text-xl font-semibold tabular-nums">{totalSystemValue === null ? '—' : totalSystemValue.toFixed(2)}</p></div>
      <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Physical stock value (entered)</p><p className="mt-1 text-xl font-semibold tabular-nums">{totalPhysicalValue === null ? '—' : totalPhysicalValue.toFixed(2)}</p></div>
    </div>
    {!activeBranches.length ? <p className="py-8 text-sm text-muted-foreground">No active branches are available for counting.</p> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm"><thead><tr>{['Product / SKU','System qty','Physical qty (enter)','Variance','Cost price / unit (read-only)','System value','Physical value','Difference (value)'].map(h => <th key={h} className="border-b px-2 py-3 font-medium text-muted-foreground">{h}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.key} className="border-b last:border-0"><td className="px-2 py-3"><p className="font-medium">{r.product}</p><p className="text-xs text-muted-foreground">{r.variant} · {r.sku}</p></td><td className="px-2 py-3 tabular-nums">{formatQuantity(r.system)} {r.unit}</td><td className="w-36 px-2 py-3"><Input aria-label={`Physical quantity for ${r.sku}`} type="number" min="0" step="1" value={drafts[r.key]?.physical ?? ''} placeholder="Enter count" disabled={activeSessionStatus !== null && activeSessionStatus !== 'draft'} onChange={e => update(r.key, 'physical', e.target.value)}/></td><td className={`px-2 py-3 tabular-nums ${r.difference !== null && r.difference !== 0 ? 'font-semibold text-destructive' : ''}`}>{r.difference === null ? '—' : formatQuantity(r.difference)}</td><td className="px-2 py-3 tabular-nums">{r.cost === null ? '—' : r.cost.toFixed(2)}</td><td className="px-2 py-3 tabular-nums">{r.systemValue === null ? '—' : r.systemValue.toFixed(2)}</td><td className="px-2 py-3 tabular-nums">{r.physicalValue === null ? '—' : r.physicalValue.toFixed(2)}</td><td className={`px-2 py-3 tabular-nums ${r.valueDifference !== null && r.valueDifference !== 0 ? 'font-semibold' : ''}`}>{r.valueDifference === null ? '—' : r.valueDifference.toFixed(2)}</td></tr>)}</tbody><tfoot><tr className="bg-muted/40 font-semibold"><td className="px-2 py-3">Total</td><td className="px-2 py-3 tabular-nums">{formatQuantity(rows.reduce((s,r)=>s+r.system,0))}</td><td className="px-2 py-3 tabular-nums">{formatQuantity(enteredRows.reduce((s,r)=>s+(r.physical??0),0))}</td><td className="px-2 py-3 tabular-nums">{totalDifference.toFixed(3)}</td><td className="px-2 py-3">—</td><td className="px-2 py-3 tabular-nums">{totalSystemValue === null ? '—' : totalSystemValue.toFixed(2)}</td><td className="px-2 py-3 tabular-nums">{totalPhysicalValue === null ? '—' : totalPhysicalValue.toFixed(2)}</td><td className="px-2 py-3 tabular-nums">{totalValueDifference === null ? '—' : totalValueDifference.toFixed(2)}</td></tr></tfoot></table></div>}
    {status && <p role="status" className="mt-4 text-sm text-primary">{status}</p>}
    <p className="mt-4 text-xs text-muted-foreground">Cost price is read-only and sourced from the product's saved purchase price (or the saved count snapshot when reopening a count). {canViewPurchasePrice ? 'System and physical stock values use this same cost basis.' : 'Purchase-price access is restricted for this account. Ask the business owner to enable “See Purchase Price” in this team member’s permissions. Valuation fields are shown as unavailable, not zero.'} Difference (value) is calculated as physical quantity minus system quantity, multiplied by cost price; shortages are negative and surpluses are positive. Saved drafts persist across refreshes; submitted counts are locked for review. Blank physical quantities are not treated as zero. Approval records the review only and never posts stock adjustments.</p>
  </section>;
}
