import { describe, expect, it, vi } from 'vitest';
import { applyStockIn, parseStockInValues, receiptOperationId } from './sheet-stock-in';

const header = ['Receipt ID', 'Date', 'SKU', 'Product (auto)', 'Qty Received', 'Unit Cost (optional)', 'Supplier / Note', 'Entered By', 'Applied in BizSathi', 'Applied on Website'];
const B = '985f4fd7-edcd-41a9-beec-8148fcb29818';

describe('parseStockInValues', () => {
  it('reads receipts, skips blank rows and reports bad ones', () => {
    const r = parseStockInValues([header, ['RCP-1', '2026-11-13', 'AL-KURTI-001', '', '5', '', 'Jaipur', 'Sam', '', ''], ['', '', '', '', '', '', '', '', '', ''], ['RCP-2', '', 'AL-KURTI-003', '', '0', '', '', '', '', ''], ['RCP-3', '', 'AL KURTI', '', '2', '', '', '', '', ''], ['RCP-4', '', 'AL-KURTI-004', '', '1.5', '', '', '', '', '']]);
    expect(r.receipts.map(x => [x.receiptId, x.sku, x.qty, x.row])).toEqual([['RCP-1', 'AL-KURTI-001', 5, 2]]);
    expect(r.issues).toHaveLength(3);
  });
  it('rejects every copy of a duplicated receipt ID', () => {
    const r = parseStockInValues([header, ['RCP-1', '', 'A-1', '', '1'], ['rcp-1', '', 'A-2', '', '2']]);
    expect(r.receipts).toEqual([]); expect(r.issues).toHaveLength(2);
  });
  it('requires the key columns', () => { expect(() => parseStockInValues([['Receipt ID', 'SKU']])).toThrow(/qty received/); });
});
describe('receiptOperationId', () => {
  it('is stable, case-insensitive and a valid v5 UUID', async () => {
    const a = await receiptOperationId(B, 'RCP-1'); expect(await receiptOperationId(B, 'rcp-1')).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); expect(await receiptOperationId(B, 'RCP-2')).not.toBe(a);
  });
});
describe('applyStockIn', () => {
  const receipts = parseStockInValues([header, ['RCP-1', '', 'AL-KURTI-001', '', '5'], ['RCP-2', '', 'NOPE', '', '1']]).receipts;
  const base = () => ({ businessId: B, variantsBySku: new Map([['al-kurti-001', ['v1']]]), existing: vi.fn().mockResolvedValue(null), post: vi.fn().mockResolvedValue(undefined) });
  it('posts new receipts once and reports unknown SKUs', async () => {
    const d = base(); const r = await applyStockIn(receipts, d);
    expect(d.post).toHaveBeenCalledTimes(1); expect(d.post.mock.calls[0]![0]).toMatchObject({ variantId: 'v1', quantity: 5, reference: 'Sheet Stock In RCP-1' });
    expect(r).toMatchObject({ applied: 1, failed: 1, syncedSkus: ['AL-KURTI-001'] });
  });
  it('does not post again when the ledger already has the receipt', async () => {
    const d = base(); d.existing.mockResolvedValue({ variantId: 'v1', quantity: 5 });
    const r = await applyStockIn(receipts.slice(0, 1), d); expect(d.post).not.toHaveBeenCalled(); expect(r.alreadyApplied).toBe(1);
  });
  it('refuses to re-apply an edited old receipt', async () => {
    const d = base(); d.existing.mockResolvedValue({ variantId: 'v1', quantity: 3 });
    const r = await applyStockIn(receipts.slice(0, 1), d); expect(d.post).not.toHaveBeenCalled(); expect(r.failed).toBe(1);
  });
  it('treats a lost race with another administrator as already applied', async () => {
    const d = base(); d.existing.mockResolvedValueOnce(null).mockResolvedValueOnce({ variantId: 'v1', quantity: 5 }); d.post.mockRejectedValue(new Error('x'));
    const r = await applyStockIn(receipts.slice(0, 1), d); expect(r).toMatchObject({ alreadyApplied: 1, failed: 0 });
  });
});
