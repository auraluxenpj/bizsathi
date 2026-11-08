import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const BIZ = '55555555-5555-4555-8555-555555555555'; const BR = '33333333-3333-4333-8333-333333333333'; const PER = '44444444-4444-4444-8444-444444444444';
const ctx = vi.hoisted(() => ({ role: 'accountant' }));
const fns = vi.hoisted(() => ({
  scan: vi.fn(async (_: unknown) => ({ id: 'new', aiError: null as string | null })), confirm: vi.fn(async (_: unknown) => ({ voucherId: 'v1' })), reject: vi.fn(async (_: unknown) => ({ ok: true })),
  upload: vi.fn(async (_p: string, _f: unknown, _o: unknown) => ({ error: null as unknown })), remove: vi.fn(async (_: unknown) => ({ error: null })),
}));
const receipts = vi.hoisted(() => ({ rows: [] as unknown[] }));
const row = (o: Record<string, unknown>) => ({ id: 'r1', file_name: 'power.jpg', mime_type: 'image/jpeg', status: 'needs_review', ai_extraction: null, ai_error: null, reviewed: null, review_note: null, voucher_id: null, uploaded_by: 'u', created_at: '2026-11-06T05:00:00Z', reviewed_at: null, url: 'https://files.example/power.jpg', ...o });
vi.mock('@tanstack/react-start', () => ({ useServerFn: (f: unknown) => f, createServerFn: () => { throw new Error('not used'); } }));
vi.mock('@/lib/inventory-queries', () => ({ businessQuery: { queryKey: ['businesses'], queryFn: async () => [{ id: BIZ, name: 'Auraluxe', role: ctx.role }] } }));
vi.mock('@/lib/vouchers.functions', () => ({ getVoucherWorkspace: async () => ({ userId: 'u', role: ctx.role, branches: [{ id: BR, name: 'Main' }], periods: [{ id: PER, name: 'FY', start_date: '2026-01-01', end_date: '2026-12-31' }], vouchers: [] }) }));
vi.mock('@/lib/receipts.functions', () => ({ listReceipts: async () => ({ receipts: receipts.rows }), scanReceipt: (a: unknown) => fns.scan(a), confirmReceipt: (a: unknown) => fns.confirm(a), rejectReceipt: (a: unknown) => fns.reject(a) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: () => ({ upload: (p: string, f: unknown, o: unknown) => fns.upload(p, f, o), remove: (a: unknown) => fns.remove(a) }) } } }));
vi.mock('@/lib/commerce.functions', () => ({ createTradingPeriod: vi.fn() }));
import { ExpenseReceipts } from '@/components/expense-receipts';

function mount() {
  const root = createRootRoute({ component: ExpenseReceipts });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) });
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
}
const ai = { supplier: 'Nepal Power', invoiceNumber: 'INV-77', date: '2026-11-05', total: '1250.00', vat: null, category: 'expense_utilities', categoryReason: 'Electricity bill' };
beforeEach(() => { ctx.role = 'accountant'; Object.values(fns).forEach(f => f.mockClear()); fns.upload.mockResolvedValue({ error: null }); sessionStorage.clear(); receipts.rows = [row({ ai_extraction: ai })]; });

describe('Scan Receipts', () => {
  it('lists receipts waiting for review with the AI suggestions', async () => {
    mount();
    expect(await screen.findByText('Nepal Power')).toBeInTheDocument();
    expect(screen.getByText('Rs. 1,250.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Needs review \(1\)/ })).toBeInTheDocument();
  });
  it('is limited to accountants and above', async () => {
    ctx.role = 'staff'; mount();
    expect(await screen.findByText(/Only accountants and administrators/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Scan receipts/ })).not.toBeInTheDocument();
  });
  it('uploads into the business folder, then has the receipt read', async () => {
    mount(); await screen.findByText('Nepal Power');
    fireEvent.change(screen.getByLabelText('Receipt files'), { target: { files: [new File(['x'], 'bill.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(fns.scan).toHaveBeenCalledTimes(1));
    expect(fns.upload.mock.calls[0]![0]).toMatch(new RegExp(`^${BIZ}/[0-9a-f-]{36}\\.jpg$`));
    expect((fns.scan.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({ businessId: BIZ, fileName: 'bill.jpg', mimeType: 'image/jpeg' });
    expect(await screen.findByText('Ready to review')).toBeInTheDocument();
  });
  it('rejects unsupported files before uploading, and cleans up when reading fails', async () => {
    mount(); await screen.findByText('Nepal Power');
    fireEvent.change(screen.getByLabelText('Receipt files'), { target: { files: [new File(['x'], 'virus.exe', { type: 'application/x-msdownload' })] } });
    expect(await screen.findByText(/Only JPG, PNG or PDF/)).toBeInTheDocument(); expect(fns.upload).not.toHaveBeenCalled();
    fns.scan.mockRejectedValueOnce(new Error('The receipt could not be saved.'));
    fireEvent.change(screen.getByLabelText('Receipt files'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByText('The receipt could not be saved.')).toBeInTheDocument(); expect(fns.remove).toHaveBeenCalledTimes(1);
  });
  it('shows a manual-entry note when the AI could not read the file', async () => {
    mount(); await screen.findByText('Nepal Power');
    fns.scan.mockResolvedValueOnce({ id: 'n', aiError: 'AI credits are used up.' });
    fireEvent.change(screen.getByLabelText('Receipt files'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByText('Added, fill in manually')).toBeInTheDocument();
  });
});

describe('Reviewing a receipt', () => {
  it('prefills from the AI, and posts exactly the expense the accountant confirmed', async () => {
    mount(); fireEvent.click(await screen.findByText('Nepal Power'));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByLabelText('Supplier')).toHaveValue('Nepal Power'); expect(within(d).getByLabelText('Amount')).toHaveValue('1250.00'); expect(within(d).getByLabelText('Category')).toHaveValue('expense_utilities');
    expect(within(d).getByText(/Electricity bill/)).toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText('Amount'), { target: { value: '1200' } });
    fireEvent.change(within(d).getByLabelText('Paid from'), { target: { value: 'wallet' } });
    await waitFor(() => expect(within(d).getByRole('button', { name: /Confirm and post/ })).toBeEnabled());
    fireEvent.click(within(d).getByRole('button', { name: /Confirm and post/ }));
    await waitFor(() => expect(fns.confirm).toHaveBeenCalledTimes(1));
    const sent = (fns.confirm.mock.calls[0]![0] as { data: { businessId: string; receiptId: string; request: Record<string, unknown> } }).data;
    expect(sent).toMatchObject({ businessId: BIZ, receiptId: 'r1' });
    expect(sent.request).toMatchObject({ kind: 'expense', businessId: BIZ, branchId: BR, periodId: PER, date: '2026-11-05', reference: expect.stringMatching(/^INV-77-/), reason: 'Nepal Power', lines: [{ account: 'expense_utilities', debit: '1200', credit: '0' }, { account: 'wallet', debit: '0', credit: '1200' }] });
  });
  it('keeps the same request id when a failed post is retried, so it can never post twice', async () => {
    fns.confirm.mockRejectedValueOnce(new Error('The expense could not be posted.'));
    mount(); fireEvent.click(await screen.findByText('Nepal Power'));
    const d = await screen.findByRole('dialog');
    await waitFor(() => expect(within(d).getByRole('button', { name: /Confirm and post/ })).toBeEnabled());
    fireEvent.click(within(d).getByRole('button', { name: /Confirm and post/ }));
    expect(await within(d).findByText('The expense could not be posted.')).toBeInTheDocument();
    fireEvent.click(within(d).getByRole('button', { name: /Confirm and post/ }));
    await waitFor(() => expect(fns.confirm).toHaveBeenCalledTimes(2));
    const ids = fns.confirm.mock.calls.map(c => (c[0] as { data: { request: { id: string } } }).data.request.id);
    expect(ids[0]).toBe(ids[1]);
  });
  it('warns about a probable duplicate', async () => {
    receipts.rows = [row({ ai_extraction: ai }), row({ id: 'r2', status: 'posted', reviewed: { reference: 'inv-77-A1B2C3', lines: [{ account: 'expense_utilities', debit: '1250.00', credit: '0' }] } })];
    mount(); fireEvent.click(await screen.findByText('Nepal Power'));
    expect(await within(await screen.findByRole('dialog')).findByText(/already posted/)).toBeInTheDocument();
  });
  it('lets the accountant type everything in when the AI failed, and will not post an empty form', async () => {
    receipts.rows = [row({ ai_error: 'AI credits are used up. Fill in the details yourself.' })];
    mount(); fireEvent.click(await screen.findByText('power.jpg'));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText(/AI credits are used up/)).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: /Confirm and post/ })).toBeDisabled();
    fireEvent.change(within(d).getByLabelText('Supplier'), { target: { value: 'Local shop' } }); fireEvent.change(within(d).getByLabelText('Amount'), { target: { value: '300' } });
    await waitFor(() => expect(within(d).getByRole('button', { name: /Confirm and post/ })).toBeEnabled());
  });
  it('rejecting needs a reason', async () => {
    mount(); fireEvent.click(await screen.findByText('Nepal Power'));
    const d = await screen.findByRole('dialog');
    fireEvent.click(within(d).getByRole('button', { name: /Reject/ }));
    expect(within(d).getByRole('button', { name: 'Reject receipt' })).toBeDisabled();
    fireEvent.change(within(d).getByLabelText('Reason'), { target: { value: 'Personal purchase' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Reject receipt' }));
    await waitFor(() => expect(fns.reject).toHaveBeenCalledTimes(1));
    expect((fns.reject.mock.calls[0]![0] as { data: unknown }).data).toEqual({ businessId: BIZ, receiptId: 'r1', note: 'Personal purchase' });
  });
});
