import Papa from 'papaparse';
import Decimal from 'decimal.js';

const Exact = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type PhysicalCountRow = { sku: string; branch: string; countedQuantity: string };
export type PhysicalCountIssue = { row: number; code: 'unknown_sku' | 'unknown_branch' | 'duplicate_count' | 'invalid_quantity' | 'quantity_difference'; sku?: string; branch?: string; systemQuantity?: string; countedQuantity?: string; difference?: string; message: string };

export function parsePhysicalCountCsv(text: string): PhysicalCountRow[] {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim().toLowerCase() });
  const error = parsed.errors.find(e => e.code !== 'UndetectableDelimiter');
  if (error) throw new Error(`CSV row ${(error.row ?? 0) + 2}: ${error.message}`);
  const fields = parsed.meta.fields ?? [];
  const pickColumn = (names: string[]) => names.find(name => fields.includes(name));
  const skuColumn = pickColumn(['sku', 'item code', 'product code']);
  const branchColumn = pickColumn(['branch', 'branch name', 'location']);
  const quantityColumn = pickColumn(['counted_quantity', 'counted quantity', 'physical quantity', 'counted stock', 'quantity']);
  if (!skuColumn || !branchColumn || !quantityColumn) throw new Error('CSV must contain SKU, Branch and Counted_Quantity columns.');
  return parsed.data.map((row, index) => {
    const sku = (row[skuColumn] ?? '').trim();
    const branch = (row[branchColumn] ?? '').trim();
    const raw = (row[quantityColumn] ?? '').trim().replace(/,/g, '');
    if (!sku || !branch || !raw) throw new Error(`CSV row ${index + 2}: SKU, Branch and Counted_Quantity are required.`);
    let quantity: InstanceType<typeof Exact>;
    try {
      quantity = new Exact(raw);
      if (!quantity.isFinite() || quantity.isNegative() || quantity.decimalPlaces() > 3) throw new Error('invalid');
    } catch {
      throw new Error(`CSV row ${index + 2}: counted quantity must be a non-negative number with up to 3 decimals.`);
    }
    return { sku, branch, countedQuantity: quantity.toString() };
  });
}

export function comparePhysicalCount(input: {
  rows: PhysicalCountRow[];
  variants: { id: string; sku: string }[];
  branches: { id: string; name: string }[];
  systemBalances: Map<string, string | number>;
}) {
  const issues: PhysicalCountIssue[] = [];
  const variantBySku = new Map(input.variants.map(v => [v.sku.trim().toLowerCase(), v]));
  const branchByName = new Map(input.branches.map(b => [b.name.trim().toLowerCase(), b]));
  const seen = new Set<string>();
  const compared = input.rows.flatMap((row, index) => {
    const variant = variantBySku.get(row.sku.toLowerCase());
    const branch = branchByName.get(row.branch.toLowerCase());
    if (!variant) { issues.push({ row: index + 2, code: 'unknown_sku', sku: row.sku, branch: row.branch, message: 'SKU was not found in this business catalogue.' }); return []; }
    if (!branch) { issues.push({ row: index + 2, code: 'unknown_branch', sku: row.sku, branch: row.branch, message: 'Branch was not found in the authorized branch list.' }); return []; }
    const key = `${branch.id}:${variant.id}`;
    if (seen.has(key)) { issues.push({ row: index + 2, code: 'duplicate_count', sku: row.sku, branch: row.branch, message: 'This SKU and branch appear more than once in the count file.' }); return []; }
    seen.add(key);
    const system = new Exact(input.systemBalances.get(key) ?? 0);
    const counted = new Exact(row.countedQuantity);
    const difference = counted.minus(system);
    if (!difference.isZero()) issues.push({ row: index + 2, code: 'quantity_difference', sku: row.sku, branch: row.branch, systemQuantity: system.toString(), countedQuantity: counted.toString(), difference: difference.toString(), message: 'Physical count differs from the current stock ledger.' });
    return [{ sku: row.sku, branch: branch.name, systemQuantity: system.toString(), countedQuantity: counted.toString(), difference: difference.toString(), status: difference.isZero() ? 'MATCH' : 'REVIEW' }];
  });
  return { compared, issues, countedRows: input.rows.length, matchedRows: compared.filter(r => r.status === 'MATCH').length, differenceRows: compared.filter(r => r.status === 'REVIEW').length, isFullyMatched: input.rows.length > 0 && compared.length === input.rows.length && issues.length === 0 };
}
