import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { compareWebsiteStock, syncWebsiteStock, syncWebsiteCatalogueDrafts, testWebsiteCatalogueConnection, validateWebsiteCatalogue } from '@/lib/website-sync.functions';
import { syncSheetStock, type SheetSyncResult } from '@/lib/sheet-stock-in.functions';
import { AURALUXE_BUSINESS_ID, type SyncReport } from '@/lib/website-sync';

type Props = { businessId: string; branches: { id: string; name: string }[]; refresh: () => void };
export function WebsiteStockSync({ businessId, branches, refresh }: Props) {
  const compare = useServerFn(compareWebsiteStock); const sync = useServerFn(syncWebsiteStock); const sheetSync = useServerFn(syncSheetStock); const syncCatalogue = useServerFn(syncWebsiteCatalogueDrafts); const testCatalogueConnection = useServerFn(testWebsiteCatalogueConnection); const validateCatalogue = useServerFn(validateWebsiteCatalogue);
  const [sheetResult, setSheetResult] = useState<SheetSyncResult | null>(null); const [validationReport, setValidationReport] = useState<Awaited<ReturnType<typeof validateWebsiteCatalogue>> | null>(null);
  const [open, setOpen] = useState(false); const [branch, setBranch] = useState(''); const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Awaited<ReturnType<typeof compareWebsiteStock>> | null>(null);
  const [report, setReport] = useState<SyncReport | null>(null); const [catalogueReport, setCatalogueReport] = useState<Awaited<ReturnType<typeof syncWebsiteCatalogueDrafts>> | null>(null); const [connectionResult, setConnectionResult] = useState<Awaited<ReturnType<typeof testWebsiteCatalogueConnection>> | null>(null); const [error, setError] = useState('');
  useEffect(() => { setOpen(false); setBranch(''); setReview(null); setReport(null); setSheetResult(null); setCatalogueReport(null); setError(''); }, [businessId]);
  if (businessId !== AURALUXE_BUSINESS_ID) return null;

  async function checkCatalogueConnection() {
    if (busy) return;
    setBusy(true); setError(''); setConnectionResult(null); setCatalogueReport(null); setReview(null); setReport(null); setSheetResult(null);
    try { setConnectionResult(await testCatalogueConnection({ data: { businessId: AURALUXE_BUSINESS_ID } })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Catalogue authentication check failed.'); }
    finally { setBusy(false); }
  }


  async function runCatalogueValidation() {
    if (busy) return;
    setBusy(true); setError(''); setValidationReport(null); setConnectionResult(null); setCatalogueReport(null);
    try { setValidationReport(await validateCatalogue({ data: { businessId: AURALUXE_BUSINESS_ID } })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Catalogue validation failed.'); }
    finally { setBusy(false); }
  }

  async function importCatalogueDrafts() {
    if (busy || !window.confirm('Send all active BizSathi products and SKUs to Auraluxe? New website products will be unpublished drafts. No stock will be imported and nothing will be published.')) return;
    setBusy(true); setError(''); setCatalogueReport(null); setReview(null); setReport(null); setSheetResult(null);
    try { setCatalogueReport(await syncCatalogue({ data: { businessId: AURALUXE_BUSINESS_ID } })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Catalogue draft sync failed. No stock or publication changes were requested.'); }
    finally { setBusy(false); refresh(); }
  }

  async function loadComparison() {
    if (!branch || busy) return;
    setBusy(true); setError(''); setReview(null); setReport(null);
    try { setReview(await compare({ data: { businessId: AURALUXE_BUSINESS_ID, branchId: branch } })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Website comparison failed.'); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!review || busy || !window.confirm(`Sync website stock with ${branches.find(b => b.id === branch)?.name}? Website quantity changes will be recorded here. For first-time SKUs, Sutra counts replace website counts; earlier website sales cannot be reconstructed.`)) return;
    setBusy(true); setError(''); setReport(null);
    try { setReport(await sync({ data: { businessId: AURALUXE_BUSINESS_ID, branchId: branch, confirmed: true } })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Sync status is uncertain. Compare again before retrying.'); }
    finally { setBusy(false); setReview(null); refresh(); }
  }
  async function syncFromSheet() {
    if (!branch || busy || !window.confirm(`Read new receipts from the Stock In sheet, add them to ${branches.find(b => b.id === branch)?.name}, then sync the website? Each receipt is recorded once; running this again is safe.`)) return;
    setBusy(true); setError(''); setReport(null); setReview(null); setSheetResult(null);
    try { setSheetResult(await sheetSync({ data: { businessId: AURALUXE_BUSINESS_ID, branchId: branch, includeWebsite: true, confirmed: true } })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Sheet sync status is uncertain. Run it again; receipts already recorded are never repeated.'); }
    finally { setBusy(false); refresh(); }
  }
  return <>
    <Button variant="outline" disabled={busy || !branches.length} onClick={() => { setOpen(true); setBranch(branch || branches[0]?.id || ''); }}><RefreshCw className={busy ? 'animate-spin' : ''} />Sync with Website</Button>
    {open && <div className="fixed inset-0 z-50 overflow-y-auto bg-background/95 p-4 sm:p-10" role="dialog" aria-modal="true" aria-labelledby="website-sync-heading">
      <section className="mx-auto max-w-3xl border bg-card p-5 shadow-lg">
        <header className="flex items-center justify-between gap-3"><h2 id="website-sync-heading" className="brand text-2xl">Auraluxe website stock</h2><Button variant="ghost" size="icon" title="Close website stock sync" aria-label="Close website stock sync" disabled={busy} onClick={() => setOpen(false)}><X /></Button></header>
        <label className="mt-6 block text-sm">Website fulfilment branch<select aria-label="Website fulfilment branch" className="mt-2 h-10 w-full rounded-md border bg-card px-3" value={branch} disabled={busy} onChange={e => { setBranch(e.target.value); setReview(null); setReport(null); setError(''); }}><option value="">Select branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <p className="mt-3 text-sm text-muted-foreground">Stock is read from the <strong>Stock In</strong> tab in Aura Final. Each row adds newly received quantity to BizSathi once, then updates Auraluxe. Create any new product and its SKU in BizSathi Products before recording its first receipt here. The Master tab is not used.</p>
        <div className="mt-4 flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={checkCatalogueConnection}>Test catalogue connection</Button><Button variant="outline" disabled={busy} onClick={runCatalogueValidation}>Validate catalogue (read-only)</Button><Button variant="outline" disabled={busy} onClick={importCatalogueDrafts}><RefreshCw />Import catalogue as drafts</Button><Button variant="outline" disabled={busy || !branch} onClick={loadComparison}><RefreshCw />{busy ? 'Working…' : 'Compare stock'}</Button>{review && <Button disabled={busy || !review.rows.some(r => r.matched)} onClick={confirm}>Confirm sync</Button>}<Button disabled={busy || !branch} onClick={syncFromSheet}><RefreshCw />Sync sheet → Sutra → Website</Button></div>
        {busy && <p role="status" className="mt-5 text-sm">Checking website stock…</p>}
        {error && <p role="alert" className="mt-5 text-sm text-destructive">{error}</p>}
        {review && <div className="mt-6">
          <p className="text-sm text-muted-foreground">{review.boundBranch ? 'Linked fulfilment branch' : 'First agreement · selected branch will become the website fulfilment branch'}</p>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[460px] text-left text-sm"><thead><tr>{['SKU','Sutra','Website','Comparison'].map(t => <th key={t} className="pb-3 pr-4 text-muted-foreground">{t}</th>)}</tr></thead><tbody>{review.rows.map(r => <tr key={r.sku} className="border-t"><td className="py-3 pr-4">{r.sku}</td><td className="pr-4 tabular-nums">{r.local}</td><td className="pr-4 tabular-nums">{r.website ?? '—'}</td><td>{!r.matched ? 'No unique match' : r.firstAgreement ? 'First agreement' : r.local === r.website && r.pending === 0 ? 'Equal' : 'Reconciliation needed'}</td></tr>)}</tbody></table></div>
          {!review.rows.length && <p className="mt-5 text-sm">No eligible active SKUs.</p>}
          {review.issues.length > 0 && <ul className="mt-4 space-y-2 text-sm text-destructive">{review.issues.map((s,i) => <li key={i}>{s}</li>)}</ul>}
        </div>}


        {validationReport && <div className="mt-6 rounded-md border p-3" role="status"><h3 className="font-medium">Live catalogue validation</h3><p className={validationReport.valid ? 'mt-2 text-sm text-green-700' : 'mt-2 text-sm text-destructive'}>{validationReport.valid ? 'Validation passed' : 'Validation found issues'} · {validationReport.row_count} rows · {validationReport.unique_skus} unique SKUs</p>{validationReport.issues.length > 0 && <ul className="mt-3 space-y-1 text-sm text-destructive">{validationReport.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}<p className="mt-2 text-xs text-muted-foreground">Read-only snapshot validation. No products, stock, publication status, or sync settings were changed.</p></div>}
        {connectionResult && <div className="mt-6 rounded-md border p-3" role="status"><h3 className="font-medium">Catalogue connection test</h3><p className={connectionResult.ok ? 'mt-2 text-sm text-green-700' : 'mt-2 text-sm text-destructive'}>{connectionResult.message} (HTTP {connectionResult.status})</p><p className="mt-1 text-xs text-muted-foreground">Read-only test. No products, stock, or website settings were changed.</p></div>}
        {catalogueReport && <div className="mt-6" role="status"><h3 className="font-medium">Catalogue draft sync complete</h3><p className="mt-2 text-sm">{catalogueReport.rows} active SKUs processed · {catalogueReport.createdProducts} new products · {catalogueReport.updatedProducts} mapped products updated · {catalogueReport.createdVariants} new variants · {catalogueReport.updatedVariants} mapped variants updated</p><p className="mt-2 text-sm text-muted-foreground">No stock was imported. New products remain unpublished drafts.</p></div>}
        {sheetResult && <div className="mt-6" role="status"><h3 className="font-medium">{sheetResult.stockIn.failed || sheetResult.website?.error || sheetResult.website?.issues.length ? 'Sheet sync finished with exceptions' : 'Sheet sync complete'}</h3><p className="mt-2 text-sm">{sheetResult.stockIn.read} receipts read · {sheetResult.stockIn.applied} new recorded · {sheetResult.stockIn.alreadyApplied} already recorded{sheetResult.website ? ` · ${sheetResult.website.recorded} website sales/returns recorded · ${sheetResult.website.updated} website counts updated` : ''}</p><p className="mt-2 text-sm text-muted-foreground">{sheetResult.sheetStatusUpdated ? 'Applied status timestamps were written back to the sheet.' : (sheetResult.sheetStatusIssue ?? 'The sheet status timestamps could not be updated. This does not undo any stock movement recorded in BizSathi.')}</p>{sheetResult.website?.error && <p className="mt-3 text-sm text-destructive">{sheetResult.website.error}</p>}{[...sheetResult.stockIn.issues, ...(sheetResult.website?.issues ?? [])].length > 0 && <ul className="mt-4 space-y-2 text-sm text-muted-foreground">{[...sheetResult.stockIn.issues, ...(sheetResult.website?.issues ?? [])].map((t, i) => <li key={i}>{t}</li>)}</ul>}</div>}
        {report && <div className="mt-6" role="status"><h3 className="font-medium">{report.error ? 'Sync stopped' : report.issues.length ? 'Sync finished with exceptions' : 'Sync complete'}</h3><p className="mt-2 text-sm">{report.compared} SKUs compared · {report.recorded} website adjustments recorded · {report.updated} counts updated</p>{report.error && <p className="mt-3 text-sm text-destructive">{report.error}</p>}{report.issues.length > 0 && <ul className="mt-4 space-y-2 text-sm text-muted-foreground">{report.issues.map((s,i) => <li key={i}>{s}</li>)}</ul>}</div>}
      </section>
    </div>}
  </>;
}