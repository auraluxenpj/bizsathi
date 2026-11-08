import { describe, expect, it, vi } from 'vitest';
import { describeAiError, readReceipt, RECEIPT_MODEL } from './receipt-ai';

const file = { bytes: new Uint8Array([1, 2, 3]), mime: 'image/jpeg', name: 'bill.jpg' };
const answer = (content: unknown) => ({ choices: [{ message: { content } }] });
class PaymentRequiredError extends Error { override name = 'PaymentRequiredError'; }
class RateLimitError extends Error { override name = 'RateLimitError'; }

describe('reading a receipt with the AI', () => {
  it('sends the image and the schema, and validates what comes back', async () => {
    const generate = vi.fn(async (_r: Record<string, unknown>) => answer(JSON.stringify({ supplier: 'Nepal Power', invoiceNumber: 'INV-1', date: '2083-07-21', total: 'Rs. 1,250', vat: null, category: 'expense_utilities', categoryReason: 'Electricity bill' })));
    const r = await readReceipt(file, generate);
    expect(r.error).toBeNull(); expect(r.model).toBe(RECEIPT_MODEL);
    expect(r.extraction).toMatchObject({ supplier: 'Nepal Power', date: '2026-11-07', total: '1250.00', category: 'expense_utilities' });
    const req = generate.mock.calls[0]![0] as { messages: { content: { type: string; image_url?: { url: string } }[] }[]; response_format: { type: string } };
    expect(req.response_format.type).toBe('json_schema');
    expect(req.messages[0]!.content[1]).toMatchObject({ type: 'image_url' }); expect(req.messages[0]!.content[1]!.image_url!.url).toBe('data:image/jpeg;base64,AQID');
  });
  it('sends PDFs as files and tolerates fenced JSON', async () => {
    const generate = vi.fn(async (_r: Record<string, unknown>) => answer('```json\n{"supplier":"A","total":"10"}\n```'));
    const r = await readReceipt({ ...file, mime: 'application/pdf', name: 'a.pdf' }, generate);
    expect(r.extraction?.supplier).toBe('A');
    expect((generate.mock.calls[0]![0] as { messages: { content: { type: string }[] }[] }).messages[0]!.content[1]!.type).toBe('file');
  });
  it('turns failures into plain messages and never throws', async () => {
    expect((await readReceipt(file, async () => { throw new PaymentRequiredError('x'); })).error).toMatch(/credits are used up/);
    expect((await readReceipt(file, async () => { throw new RateLimitError('x'); })).error).toMatch(/busy/);
    expect((await readReceipt(file, async () => { throw new Error('boom'); })).error).toMatch(/could not read/);
    expect((await readReceipt(file, async () => answer('not json'))).error).toMatch(/could not be understood/);
    expect((await readReceipt(file, async () => answer('{}'))).error).toMatch(/No details/);
    expect((await readReceipt(file, async () => answer('{}'))).extraction).toBeNull();
  });
  it('describes unknown errors safely', () => expect(describeAiError(undefined)).toMatch(/could not read/));
});
