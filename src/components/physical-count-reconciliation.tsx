import { useState } from 'react';
import { ClipboardCheck, Download, FileSpreadsheet, ShieldCheck, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parsePhysicalCountCsv, comparePhysicalCount } from '@/lib/physical-count-reconciliation';
import { stockBalances } from '@/lib/inventory-schemas';
import { downloadCsv } from '@/lib/download-csv';
import { makeCsv } from '@/lib/inventory-csv';

type Props = {
  variants: { id: string; sku: string; is_active: boolean; products?: { is_active?: boolean | null } | null }[];
  branches: { id: string; name: string; is_active: boolean }[];
  movements: { variant_id: string; branch_id: string; quantity: number }[];
};
export function PhysicalCountReconciliation({ variants, branches, movements }: Props) {
  const [result, setResult] = useState<ReturnType<typeof comparePhysicalCount> | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function readFile(file?: File) {
    if (!file) return;
    setLoading(true); setError(''); setResult(null); setFileName(file.name);
    try {
      const rows = parsePhysicalCountCsv(await file.text());
      const totals = stockBalances(movements);
      const systemBalances = new Map([...totals].map(([key, value]) => [key, value]));
      setResult(comparePhysicalCount({
        rows,
        variants: variants.filter(v => v.is_active && v.products?.is_active !== false).map(v => ({ id: v.id, sku: v.sku })),
        branches: branches.filter(b => b.is_active).map(b => ({ id: b.id, name: b.name })),
        systemBalances,
      }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Count file could not be read.'); }
    finally { setLoading(false); }
  }
  const rows = result?.compared ?? [];
  return <section className="mt-7 rounded-xl border bg-card p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardCheck className="size-5"/></span><div><h2 className="brand text-xl">Physical count reconciliation</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Compare an independently counted stock sheet against the current BizSathi stock ledger. This check is read-only and never posts stock adjustments.</p></div></div>
      {result && <Button variant="outline" size="sm" onClick={() => downloadCsv('physical-count-reconciliation.csv', makeCsv(rows, ['sku','branch','systemQuantity','countedQuantity','difference','status']))}><Download className="size-4"/>Export results</Button>}
    </div>
    <div className="mt-5 rounded-lg border border-dashed p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-medium"><FileSpreadsheet className="size-4 text-primary"/>Upload physical count CSV</div><label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Upload className="size-4"/>{loading ? 'Reading…' : 'Choose CSV'}<input className="sr-only" type="file" accept=".csv,text/csv" disabled={loading} onChange={e => { void readFile(e.target.files?.[0]); e.currentTarget.value = ''; }}/></label></div>
      <p className="mt-2 text-xs text-muted-foreground">Required columns: <code>SKU</code>, <code>Branch</code>, <code>Counted_Quantity</code>. One row per SKU per branch. Quantities allow up to 3 decimal places.</p>
      <p className="mt-1 text-xs text-muted-foreground">Selected file: {fileName || 'None'}</p>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {result && <>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Rows counted</p><p className="mt-1 text-2xl font-semibold tabular-nums">{result.countedRows}</p></div>
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Matched</p><p className="mt-1 text-2xl font-semibold tabular-nums">{result.matchedRows}</p></div>
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Differences / invalid rows</p><p className="mt-1 text-2xl font-semibold tabular-nums">{result.issues.length}</p></div>
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary"/>
        <p>{result.isFullyMatched ? 'All uploaded count rows match the current ledger. This confirms only the uploaded rows, not uncounted items or historical cost evidence.' : 'Review required. The uploaded sheet is a partial count unless every active SKU and branch is included. No differences have been posted or corrected.'}</p>
      </div>
      {rows.length > 0 && <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr>{['SKU','Branch','Ledger qty','Counted qty','Difference','Status'].map(h=><th key={h} className="border-b pb-2 pr-3 font-medium text-muted-foreground">{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={`${r.branch}:${r.sku}:${i}`} className="border-b last:border-0"><td className="py-3 pr-3 font-medium">{r.sku}</td><td className="pr-3">{r.branch}</td><td className="pr-3 tabular-nums">{r.systemQuantity}</td><td className="pr-3 tabular-nums">{r.countedQuantity}</td><td className="pr-3 tabular-nums">{r.difference}</td><td className={r.status==='MATCH'?'text-primary':'text-destructive'}>{r.status}</td></tr>)}</tbody></table></div>}
      {result.issues.length > 0 && <div className="mt-5"><h3 className="mb-2 text-sm font-semibold">Items requiring review</h3><div className="space-y-2">{result.issues.map((issue,i)=><div key={`${issue.row}:${issue.code}:${i}`} className="rounded-md border p-3 text-sm"><p className="font-medium">CSV row {issue.row} · {issue.sku ?? 'Unknown SKU'} · {issue.branch ?? 'Unknown branch'}</p><p className="mt-1 text-muted-foreground">{issue.message}</p></div>)}</div></div>}
    </>}
    <p className="mt-4 text-xs text-muted-foreground">The ledger quantity is calculated from authorized stock movement history. This screen does not validate the historical opening point, source-document completeness, or inventory valuation.</p>
  </section>;
}
