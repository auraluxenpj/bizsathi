import { describe, expect, it } from 'vitest';
import { buildExpenseRequest, checkReceiptFile, findDuplicate, normalizeDate, normalizeExtraction, normalizeMoney, receiptCategories, receiptPath } from './receipt-schemas';

const id = '00000000-0000-4000-8000-000000000001';
const base = { id, businessId: id, branchId: id, periodId: id, receiptId: '12345678-0000-4000-8000-000000000009', date: '2026-11-06', supplier: 'Nepal Power', invoiceNumber: 'INV-77', amount: '100.25', category: 'expense_utilities', method: 'bank' as const, note: '' };

describe('receipt values from the AI', () => {
  it('cleans amounts and rejects nonsense', () => {
    expect(normalizeMoney('Rs. 1,234.50')).toBe('1234.50'); expect(normalizeMoney(99)).toBe('99.00'); expect(normalizeMoney('12.345')).toBe('12.35');
    for (const bad of ['', 'abc', '0', '-5', null, undefined, {}, '1e99']) expect(normalizeMoney(bad)).toBeNull();
  });
  it('accepts real dates, converts Bikram Sambat dates, and rejects the rest', () => {
    expect(normalizeDate('2026-11-06')).toBe('2026-11-06'); expect(normalizeDate('2083-07-21')).toBe('2026-11-07');
    for (const bad of ['2026-13-40', '06/11/2026', 'yesterday', '2083-07-99', null]) expect(normalizeDate(bad)).toBeNull();
  });
  it('keeps only known categories and drops the reason when the category is dropped', () => {
    expect(normalizeExtraction({ supplier: ' Ncell ', category: 'expense_utilities', categoryReason: 'Phone bill', total: '500' })).toMatchObject({ supplier: 'Ncell', category: 'expense_utilities', categoryReason: 'Phone bill', total: '500.00' });
    expect(normalizeExtraction({ category: 'sales', categoryReason: 'x' })).toMatchObject({ category: null, categoryReason: null });
    expect(normalizeExtraction('not an object')).toMatchObject({ supplier: null, total: null });
  });
  it('offers the nine expense categories', () => { expect(receiptCategories.map(c => c.id)).toContain('expense_professional'); expect(receiptCategories).toHaveLength(9); });
});
describe('files', () => {
  it('allows only images and PDFs up to 8 MB', () => {
    expect(checkReceiptFile({ type: 'image/png', size: 1000 })).toBeNull(); expect(checkReceiptFile({ type: 'application/pdf', size: 8 * 1024 * 1024 })).toBeNull();
    expect(checkReceiptFile({ type: 'image/gif', size: 1000 })).toMatch(/JPG, PNG or PDF/); expect(checkReceiptFile({ type: 'image/png', size: 8 * 1024 * 1024 + 1 })).toMatch(/8 MB/); expect(checkReceiptFile({ type: 'image/png', size: 0 })).toMatch(/empty/);
  });
  it('stores files inside the business folder', () => expect(receiptPath(id, 'image/jpeg', 'abc')).toBe(`${id}/abc.jpg`));
});
describe('expense request', () => {
  it('debits the category and credits bank or wallet, using the invoice number as the reference', () => {
    const r = buildExpenseRequest(base);
    expect(r).toMatchObject({ kind: 'expense', reference: 'INV-77-123456', reason: 'Nepal Power', date: '2026-11-06' });
    expect('lines' in r && r.lines).toEqual([{ account: 'expense_utilities', debit: '100.25', credit: '0' }, { account: 'bank', debit: '0', credit: '100.25' }]);
    expect('lines' in buildExpenseRequest({ ...base, method: 'wallet', category: 'expense_salaries' }) && true).toBe(true);
  });
  it('invents a reference when there is no invoice number, and rejects protected accounts and bad amounts', () => {
    expect(buildExpenseRequest({ ...base, invoiceNumber: ' ' }).reference).toBe('RECEIPT-123456');
    expect(buildExpenseRequest({ ...base, receiptId: 'abcdef12-0000-4000-8000-000000000009' }).reference).not.toBe(buildExpenseRequest(base).reference);
    expect(() => buildExpenseRequest({ ...base, category: 'sales' })).toThrow();
    expect(() => buildExpenseRequest({ ...base, amount: '100.255' })).toThrow();
    expect(() => buildExpenseRequest({ ...base, amount: '0' })).toThrow();
  });
});
describe('duplicates', () => {
  const posted = [{ reviewed: { reference: 'inv-77-A1B2C3', lines: [{ account: 'expense_utilities', debit: '100.25', credit: '0' }, { account: 'bank', debit: '0', credit: '100.25' }] } }];
  it('flags the same invoice number and amount', () => { expect(findDuplicate('INV-77', '100.25', posted)).toBe(true); expect(findDuplicate(' inv-77 ', '100.250', posted)).toBe(true); });
  it('ignores different amounts, numbers and blanks', () => { expect(findDuplicate('INV-77', '100.00', posted)).toBe(false); expect(findDuplicate('INV-78', '100.25', posted)).toBe(false); expect(findDuplicate('', '100.25', posted)).toBe(false); expect(findDuplicate('INV-77', 'x', posted)).toBe(false); });
});
