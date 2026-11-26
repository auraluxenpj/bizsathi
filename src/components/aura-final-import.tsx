import { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { Button } from './ui/button';
import type { CommerceWorkspace } from './commerce-workspace';
import { importAuraFinalStock } from '@/lib/aura-final-import.functions';

const EXPECTED_HEADERS = [
  'model_code', 'category', 'variant_name', 'sku', 'product_name', 'barcode',
  'unit', 'qty', 'selling_price', 'mrp', 'wholesale_price', 'purchase_price', 'reorder_level',
] as const;

type AuraRow = { row: number; sku: string; name: string; category: string; qty: number; price: string; status: 'ready' | 'zero' | 'missing' | 'ambiguous' | 'invalid' };
function clean(value: unknown) { return String(value ?? '').trim(); }
async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function AuraFinalImport({ w, onComplete }: { w: CommerceWorkspace; onComplete: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [rows, setRows] = useState<AuraRow[]>([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const queryClient = useQueryClient();
  const post = useServerFn(importAuraFinalStock);
  const branchId = w.activeBranchId || (w.access.data?.branches.filter(b => b.is_active).length === 1 ? w.access.data.branches.find(b => b.is_active)?.id ?? '' : '');
  const variants = w.inventory.data?.variants.filter(v => v.is_active && v.products?.is_active) ?? [];

  const summary = useMemo(() => ({
    ready: rows.filter(r => r.status === 'ready').length,
    zero: rows.filter(r => r.status === 'zero').length,
    blocked: rows.filter(r => !['ready', 'zero'].includes(r.status)).length,
    quantity: rows.filter(r => r.status === 'ready').reduce((n, r) => n + r.qty, 0),
  }), [rows]);

  const mutation = useMutation({
    mutationFn: () => post({ data: { businessId: w.businessId, branchId, rows: rows.filter(r => r.status === 'ready').map(r => ({ sku: r.sku, quantity: r.qty })) } }),
    onSuccess: async report => {
      await queryClient.invalidateQueries({ queryKey: ['inventory', w.businessId] });
      await queryClient.invalidateQueries({ queryKey: ['commerce', w.businessId] });
      setResult(`Import finished: ${report.applied} added · ${report.alreadyApplied} already imported · ${report.failed} failed.${report.issues.length ? ' ' + report.issues.join(' | ') : ''}`);
      onComplete();
    },
    onError: e => setError(e instanceof Error ? e.message : 'Import failed. No stock change was confirmed.'),
  });

  async function readFile(file?: File) {
    setError(''); setResult(''); setRows([]); setFileName(''); setFileHash('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('Please upload the Aura Final CSV file. This importer currently accepts CSV; XLSX support is not enabled yet.'); return; }
    try {
      const raw = await file.text();
      const parsed = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim() });
      if (parsed.errors.length) throw new Error(`CSV reading issue: ${parsed.errors[0]?.message ?? 'check the file'}`);
      const headers = parsed.meta.fields ?? [];
      if (headers.length !== EXPECTED_HEADERS.length || headers.some((h, i) => h !== EXPECTED_HEADERS[i])) {
        throw new Error('This is not the expected Aura Final format. Keep the original 13 headers and their exact order; do not rename or rearrange columns.');
      }
      const data = parsed.data;
      const counts = new Map<string, number>();
      for (const r of data) { const sku = clean(r['sku']).toLowerCase(); if (sku) counts.set(sku, (counts.get(sku) ?? 0) + 1); }
      const next: AuraRow[] = data.map((r, i) => {
        const sku = clean(r['sku']); const qtyText = clean(r['qty']).replace(/,/g, '');
        const qty = /^\d+$/.test(qtyText) ? Number(qtyText) : NaN;
        const matches = variants.filter(v => v.sku.trim().toLowerCase() === sku.toLowerCase());
        let status: AuraRow['status'] = 'ready';
        if (!sku || !Number.isSafeInteger(qty) || qty < 0) status = 'invalid';
        else if ((counts.get(sku.toLowerCase()) ?? 0) > 1) status = 'invalid';
        else if (qty === 0) status = 'zero';
        else if (matches.length === 0) status = 'missing';
        else if (matches.length > 1) status = 'ambiguous';
        return { row: i + 2, sku, name: clean(r['product_name']), category: clean(r['category']), qty: Number.isFinite(qty) ? qty : 0, price: clean(r['purchase_price']), status };
      });
      setRows(next); setFileName(file.name); setFileHash(await sha256(raw));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read this file.'); }
  }

  return <section className="inline-flex">
    <Button variant="outline" onClick={() => { setOpen(v => !v); setError(''); setResult(''); }}><FileSpreadsheet />Import Purchase Excel</Button>
    {open && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label="Import Aura Final stock">
      <div className="mx-auto my-6 max-w-5xl rounded-xl border bg-background p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Import Aura Final stock</h2><p className="mt-1 text-sm text-muted-foreground">Upload the original Aura Final CSV. Preview and resolve every issue before adding stock.</p></div><Button size="icon" variant="ghost" aria-label="Close importer" onClick={() => setOpen(false)}><X /></Button></div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={e => void readFile(e.target.files?.[0])} />
          <Button variant="outline" onClick={() => inputRef.current?.click()}><Upload />Choose Aura Final CSV</Button>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          <span className="text-xs text-muted-foreground">Exact original column names and order required.</span>
        </div>
        {error && <p role="alert" className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {rows.length > 0 && <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Ready to add</p><p className="text-xl font-semibold tabular-nums">{summary.ready}</p></div>
            <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Total new quantity</p><p className="text-xl font-semibold tabular-nums">{summary.quantity.toLocaleString()}</p></div>
            <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Zero quantity skipped</p><p className="text-xl font-semibold tabular-nums">{summary.zero}</p></div>
            <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Needs fixing</p><p className="text-xl font-semibold tabular-nums">{summary.blocked}</p></div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">{branchId ? <span className="text-muted-foreground">Stock destination: {w.access.data?.branches.find(b => b.id === branchId)?.name ?? 'Selected branch'}</span> : <span className="text-destructive">Select an authorised active branch before importing.</span>}<span className="text-muted-foreground">· Existing stock will be increased, never replaced.</span></div>
          <div className="mt-4 max-h-80 overflow-auto rounded-md border"><table className="w-full min-w-[650px] text-left text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-2">CSV row</th><th className="p-2">SKU</th><th className="p-2">Product</th><th className="p-2 text-right">Qty</th><th className="p-2">Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.row} className="border-t"><td className="p-2 tabular-nums">{r.row}</td><td className="p-2">{r.sku || '—'}</td><td className="p-2">{r.name}</td><td className="p-2 text-right tabular-nums">{r.qty}</td><td className="p-2">{r.status === 'ready' ? <span className="text-green-700">Ready</span> : r.status === 'zero' ? 'Skipped · zero qty' : r.status === 'missing' ? <span className="text-destructive">SKU not found</span> : r.status === 'ambiguous' ? <span className="text-destructive">Duplicate active SKU</span> : <span className="text-destructive">Invalid / duplicate row</span>}</td></tr>)}</tbody></table></div>
          <p className="mt-3 text-xs text-muted-foreground">Product names and prices are for reference only. This import changes stock quantities only. Zero-quantity rows are skipped. Missing or duplicate SKUs block those rows.</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => { setRows([]); setFileName(''); setFileHash(''); setResult(''); }}>Clear file</Button><Button disabled={!branchId || !fileHash || !summary.ready || summary.blocked > 0 || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Adding stock…' : 'Approve & Add Stock'}</Button></div>
        </>}
        {result && <p role="status" className="mt-4 rounded-md border p-3 text-sm">{result}</p>}
        {mutation.isPending && <p role="status" className="mt-3 text-sm text-muted-foreground">Posting stock receipts to the BizSathi stock ledger. Do not close this window.</p>}
      </div>
    </div>}
  </section>;
}
