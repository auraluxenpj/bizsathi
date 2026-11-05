import { describe, expect, it } from 'vitest';
import { allBalances, allocatePayment, ledgerEntries, outstandingInvoices, partyBalance, type LedgerDoc, type LedgerPayment } from './party-ledger';

const doc = (o: Partial<LedgerDoc> & { id: string; kind: string; total: number }): LedgerDoc => ({ status: 'confirmed', document_date: '2026-10-01', created_at: '1', party_id: 'p1', source_id: null, reference: o.id, branch_id: 'b1', ...o });
const pay = (o: Partial<LedgerPayment> & { id: string; document_id: string; amount: number; direction: string }): LedgerPayment => ({ payment_date: '2026-11-01', created_at: '2', method: 'cash', reference: 'pay', ...o });

describe('party ledger', () => {
  it('tracks what a customer owes after a part payment', () => {
    const docs = [doc({ id: 's1', kind: 'sale', total: 1000 })];
    const payments = [pay({ id: 'a', document_id: 's1', amount: 400, direction: 'in' })];
    expect(partyBalance('p1', docs, payments)).toBe(600);
    expect(ledgerEntries('p1', docs, payments).map(e => e.balance)).toEqual([1000, 600]);
  });
  it('shows a negative balance when you owe a supplier', () => {
    const docs = [doc({ id: 'b1', kind: 'purchase', total: 1000, party_id: 'p2' })];
    const payments = [pay({ id: 'a', document_id: 'b1', amount: 250, direction: 'out' })];
    expect(allBalances(docs, payments).get('p2')).toBe(-750);
  });
  it('nets returns off an invoice', () => {
    const docs = [doc({ id: 's1', kind: 'sale', total: 1000 }), doc({ id: 'r1', kind: 'sale_return', total: 300, source_id: 's1', document_date: '2026-10-02' })];
    expect(partyBalance('p1', docs, [])).toBe(700);
    expect(outstandingInvoices('p1', 'sale', docs, [])[0]?.outstanding).toBe(700);
  });
  it('ignores drafts and other parties', () => {
    const docs = [doc({ id: 's1', kind: 'sale', total: 500, status: 'draft' }), doc({ id: 's2', kind: 'sale', total: 800, party_id: 'p9' })];
    expect(partyBalance('p1', docs, [])).toBe(0);
  });
});

describe('payment allocation', () => {
  const docs = [doc({ id: 's2', kind: 'sale', total: 500, document_date: '2026-10-05' }), doc({ id: 's1', kind: 'sale', total: 1000, document_date: '2026-10-01' })];
  const rows = outstandingInvoices('p1', 'sale', docs, [pay({ id: 'a', document_id: 's1', amount: 200, direction: 'in' })]);
  it('lists oldest first with what is left', () => {
    expect(rows.map(r => [r.doc.id, r.outstanding])).toEqual([['s1', 800], ['s2', 500]]);
  });
  it('fills the oldest invoice first', () => {
    expect(allocatePayment(rows, 900).map(a => [a.documentId, a.amount])).toEqual([['s1', 800], ['s2', 100]]);
  });
  it('rejects overpayment and bad amounts', () => {
    expect(() => allocatePayment(rows, 1300.01)).toThrow();
    expect(() => allocatePayment(rows, 0)).toThrow();
    expect(() => allocatePayment(rows, 10.005)).toThrow();
  });
});
