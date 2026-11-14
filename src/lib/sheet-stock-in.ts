import { z } from 'zod';

/** The common Aura Luxe sheet tab where new stock is typed, one row per receipt. */
export const STOCK_IN_SHEET = 'Stock In';
export const STOCK_IN_REFERENCE_PREFIX = 'Sheet Stock In ';

export type StockInReceipt = { row: number; receiptId: string; date: string; sku: string; qty: number; note: string; enteredBy: string; appliedInBizsathi: string; appliedOnWebsite: string };
export type StockInParse = { receipts: StockInReceipt[]; issues: string[] };

const receiptId = z.string().regex(/^[A-Za-z0-9._-]{3,60}$/, 'Receipt ID must be 3-60 letters, numbers, dot, dash or underscore');
const sku = z.string().regex(/^\S{1,64}$/, 'SKU cannot contain spaces');
const qty = z.number().int('Qty must be a whole number').min(1, 'Qty must be at least 1').max(1_000_000);

const headers = { receiptId: 'receipt id', date: 'date', sku: 'sku', qty: 'qty received', note: 'supplier / note', enteredBy: 'entered by', appliedInBizsathi: 'applied in bizsathi', appliedOnWebsite: 'applied on website' } as const;

function cell(value: unknown): string { return value === null || value === undefined ? '' : String(value).trim(); }
function wholeNumber(text: string): number { const cleaned = text.replace(/,/g, ''); return /^\d+$/.test(cleaned) ? Number(cleaned) : NaN; }

/** Turns the raw "Stock In" tab values (first row = headers) into validated receipts. Rows are never trusted blindly: a bad or duplicated row is reported and skipped. */
export function parseStockInValues(values: unknown): StockInParse {
  const rows = z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).parse(values);
  const header = rows[0]?.map(h => cell(h).toLowerCase());
  if (!header?.length) throw new Error('The Stock In tab is empty.');
  const col = Object.fromEntries(Object.entries(headers).map(([key, name]) => [key, header.indexOf(name)])) as Record<keyof typeof headers, number>;
  for (const required of ['receiptId', 'sku', 'qty'] as const) if (col[required] < 0) throw new Error(`The Stock In tab needs a "${headers[required]}" column (case does not matter).`);
  const at = (r: (string | number | boolean | null)[], key: keyof typeof headers) => (col[key] >= 0 ? cell(r[col[key]]) : '');
  const issues: string[] = []; const parsed: StockInReceipt[] = [];
  rows.slice(1).forEach((r, i) => {
    const row = i + 2;
    const raw = { receiptId: at(r, 'receiptId'), sku: at(r, 'sku'), qty: at(r, 'qty') };
    if (!raw.receiptId && !raw.sku && !raw.qty) return;
    const checked = z.object({ receiptId, sku, qty }).safeParse({ receiptId: raw.receiptId, sku: raw.sku, qty: wholeNumber(raw.qty) });
    if (!checked.success) { issues.push(`Row ${row}: ${checked.error.issues[0]?.message ?? 'invalid row'}`); return; }
    parsed.push({ row, ...checked.data, date: at(r, 'date'), note: at(r, 'note'), enteredBy: at(r, 'enteredBy'), appliedInBizsathi: at(r, 'appliedInBizsathi'), appliedOnWebsite: at(r, 'appliedOnWebsite') });
  });
  // A receipt ID used twice is ambiguous: apply neither copy until the sheet is fixed.
  const seen = new Map<string, number>();
  for (const r of parsed) seen.set(r.receiptId.toLowerCase(), (seen.get(r.receiptId.toLowerCase()) ?? 0) + 1);
  const receipts = parsed.filter(r => {
    if ((seen.get(r.receiptId.toLowerCase()) ?? 0) > 1) { issues.push(`Row ${r.row}: Receipt ID ${r.receiptId} is used more than once; fix it so each receipt has its own ID`); return false; }
    return true;
  });
  return { receipts, issues };
}

/** Same receipt ID always maps to the same operation UUID (UUID v5), so a retry can never post twice. */
const NAMESPACE = '6f1b6d0e-5a4c-4d3b-9a57-0a1a2b3c4d5e';
export async function receiptOperationId(businessId: string, receipt: string): Promise<string> {
  const bytes = (hex: string) => Uint8Array.from(hex.replace(/-/g, '').match(/../g)!.map(h => parseInt(h, 16)));
  const ns = bytes(NAMESPACE); const name = new TextEncoder().encode(`${businessId}:${receipt.trim().toLowerCase()}`);
  const data = new Uint8Array(ns.length + name.length); data.set(ns); data.set(name, ns.length);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', data)).slice(0, 16);
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50; hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(hash, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type StockInReport = { read: number; applied: number; alreadyApplied: number; failed: number; issues: string[]; syncedSkus: string[] };
type ExistingMovement = { variantId: string; quantity: number };
type Dependencies = {
  businessId: string;
  /** SKU (any case) -> active variant ids. Exactly one is required. */
  variantsBySku: Map<string, string[]>;
  /** Movement already recorded for this receipt reference, if any. */
  existing: (reference: string) => Promise<ExistingMovement | null>;
  post: (request: { id: string; variantId: string; quantity: number; reference: string; reason: string }) => Promise<void>;
};

/** Posts each new receipt once as a "receive" movement. Re-running with the same sheet is harmless. */
export async function applyStockIn(receipts: StockInReceipt[], d: Dependencies): Promise<StockInReport> {
  const report: StockInReport = { read: receipts.length, applied: 0, alreadyApplied: 0, failed: 0, issues: [], syncedSkus: [] };
  for (const r of receipts) {
    const variants = d.variantsBySku.get(r.sku.toLowerCase()) ?? [];
    if (variants.length !== 1) { report.failed++; report.issues.push(`${r.receiptId}: SKU ${r.sku} ${variants.length ? 'matches several items' : 'is not in BizSathi (import the Master tab first)'}`); continue; }
    const variantId = variants[0]!; const reference = `${STOCK_IN_REFERENCE_PREFIX}${r.receiptId}`;
    const found = await d.existing(reference);
    if (found) {
      if (found.variantId === variantId && found.quantity === r.qty) report.alreadyApplied++;
      else { report.failed++; report.issues.push(`${r.receiptId}: already recorded with different details. Do not edit old rows; add a new receipt (or a stock adjustment) for the difference`); }
      continue;
    }
    try {
      await d.post({ id: await receiptOperationId(d.businessId, r.receiptId), variantId, quantity: r.qty, reference, reason: `Stock In sheet${r.date ? ` · ${r.date}` : ''}${r.note ? ` · ${r.note}` : ''}`.slice(0, 500) });
      report.applied++; report.syncedSkus.push(r.sku);
    } catch {
      // A concurrent run by another administrator may have posted it between the check and the post.
      const again = await d.existing(reference);
      if (again && again.variantId === variantId && again.quantity === r.qty) report.alreadyApplied++;
      else { report.failed++; report.issues.push(`${r.receiptId}: not recorded. Check branch access and try again; nothing was posted twice`); }
    }
  }
  return report;
}
