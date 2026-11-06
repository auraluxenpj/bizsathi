import { describe, expect, it } from 'vitest';
import { invoiceMessage, invoiceTitle } from './invoice-message';

const base = { business: 'Auraluxe Private Limited', reference: 'INV-20261106-AB12', date: '2026-11-06', kind: 'sale', party: 'Ram Traders', total: 3000, paid: 1000, outstanding: 2000, lines: [{ sku: 'S1', name: 'Silk Saree', quantity: 2, price: 1500, total: 3000 }] };
describe('invoiceMessage', () => {
  it('lists the business, document, items, totals and balance', () => {
    const m = invoiceMessage(base);
    expect(m).toContain('Auraluxe Private Limited');
    expect(m).toContain('Invoice INV-20261106-AB12');
    expect(m).toContain('BS · 2026-11-06 AD');
    expect(m).toContain('To: Ram Traders');
    expect(m).toContain('Silk Saree × 2 = Rs. 3,000.00');
    expect(m).toContain('Total: Rs. 3,000.00');
    expect(m).toContain('Paid: Rs. 1,000.00');
    expect(m).toContain('Balance due: Rs. 2,000.00');
    expect(m.endsWith('Thank you!')).toBe(true);
  });
  it('leaves out paid and balance lines when nothing is paid or due, and the customer when walk-in', () => {
    const m = invoiceMessage({ ...base, party: '', paid: 0, outstanding: 0 });
    expect(m).not.toMatch(/Paid|Balance due|To:/);
  });
  it('shortens very long invoices', () => {
    const lines = Array.from({ length: 15 }, (_, i) => ({ sku: `S${i}`, name: `Item ${i}`, quantity: 1, price: 10, total: 10 }));
    const m = invoiceMessage({ ...base, lines });
    expect(m).toContain('Item 11');
    expect(m).not.toContain('Item 12');
    expect(m).toContain('+ 3 more items');
  });
  it('names document types', () => {
    expect(invoiceTitle('sale_return')).toBe('Credit note');
    expect(invoiceTitle('goods_receipt')).toBe('Goods receipt');
  });
});
