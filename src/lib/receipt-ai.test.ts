import { describe, expect, it, vi } from 'vitest';
import { describeAiError, readReceipt, RECEIPT_MODEL } from './receipt-ai';

const file = { bytes: new Uint8Array([1, 2, 3]), mime: 'image/jpeg', name: 'bill.jpg' };
const answer = JSON.stringify({ supplier: 'Nepal Power', invoiceNumber: 'INV-1', date: '2083-07-21', total: 'Rs. 1,250', vat: null, category: 'expense_utilities', categoryReason: 'Electricity bill' });
class PaymentRequiredError extends Error { override name = 'PaymentRequiredError'; }
class RateLimitError extends Error { override name = 'RateLimitError'; }

describe('reading a receipt with the AI', () => {
  it('sends image bytes and the accounting prompt, then validates the result', async () => {
    const generate = vi.fn(async (_r: { file: typeof file; prompt: string }) => answer);
    const r = await readReceipt(file, generate);
    expect(r.error).toBeNull();
    expect(r.model).toBe(RECEIPT_MODEL);
    expect(r.extraction).toMatchObject({ supplier: 'Nepal Power', date: '2026-11-07', total: '1250.00', category: 'expense_utilities' });
    expect(generate.mock.calls[0]![0].file).toEqual(file);
    expect(generate.mock.calls[0]![0].prompt).toContain('Never guess numbers');
  });

  it('passes PDF bytes and filename unchanged to the provider', async () => {
    const pdf = { ...file, mime: 'application/pdf', name: 'a.pdf' };
    const generate = vi.fn(async (_r: { file: typeof pdf; prompt: string }) => JSON.stringify({ supplier: 'A', total: '10' }));
    const r = await readReceipt(pdf, generate);
    expect(r.extraction?.supplier).toBe('A');
    expect(generate.mock.calls[0]![0].file).toEqual(pdf);
  });

  it('turns provider failures and malformed responses into plain messages', async () => {
    expect((await readReceipt(file, async () => { throw new PaymentRequiredError('x'); })).error).toMatch(/billing or quota/);
    expect((await readReceipt(file, async () => { throw new RateLimitError('x'); })).error).toMatch(/busy/);
    expect((await readReceipt(file, async () => { throw new Error('boom'); })).error).toMatch(/could not read/);
    expect((await readReceipt(file, async () => 'not json')).error).toMatch(/could not be understood/);
    expect((await readReceipt(file, async () => '{}')).error).toMatch(/No details/);
    expect((await readReceipt(file, async () => '{}')).extraction).toBeNull();
  });

  it('describes unknown errors safely', () => expect(describeAiError(undefined)).toMatch(/could not read/));
});
