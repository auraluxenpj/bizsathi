vi.mock('@/lib/sales-cash-flow.functions',()=>({getPaymentQr:async()=>({url:null,provider:'',payee:'',instructions:''}),saveCreditLimit:vi.fn(),savePaymentQr:vi.fn()}));
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const acct = vi.hoisted(() => ({ list: [] as { id: string; name: string; kind: string; isActive: boolean; balance: number }[], tagged: vi.fn(async (_: unknown) => 'ok') }));
const record = vi.fn(async (_: unknown) => 'ok');
const commerce = {
  role: 'owner', userId: '66666666-6666-4666-8666-666666666666', counters: [], journals: [],
  periods: [{ id: '44444444-4444-4444-8444-444444444444', status: 'open', start_date: '2026-01-01', end_date: '2026-12-31', name: 'FY' }],
  documents: [
    { id: '11111111-1111-4111-8111-111111111111', kind: 'sale', status: 'confirmed', total: 1000, document_date: '2026-10-01', created_at: '1', party_id: 'p1', source_id: null, reference: 'INV-1', branch_id: '33333333-3333-4333-8333-333333333333' },
    { id: '22222222-2222-4222-8222-222222222222', kind: 'purchase', status: 'confirmed', total: 700, document_date: '2026-10-02', created_at: '2', party_id: 'p2', source_id: null, reference: 'BILL-1', branch_id: '33333333-3333-4333-8333-333333333333' },
  ],
  payments: [{ id: 'pay1', document_id: '11111111-1111-4111-8111-111111111111', amount: 400, direction: 'in', payment_date: '2026-10-05', created_at: '3', method: 'bank', reference: 'first part' }],
};
vi.mock('@tanstack/react-start', () => ({ useServerFn: (f: unknown) => f, createServerFn: () => { throw new Error('not used'); } }));
vi.mock('@/lib/accounts.functions', () => ({ getAccountBalances: async () => ({ accounts: acct.list, unassigned: { cash: 0, bank: 0, wallet: 0 } }), confirmDocumentTagged: vi.fn(), recordPaymentTagged: (a: unknown) => acct.tagged(a), postVoucherTagged: vi.fn(), createAccount: vi.fn(), adjustAccount: vi.fn(), transferBetweenAccounts: vi.fn() }));
vi.mock('@/lib/commerce.functions', () => ({ getCommerce: async () => commerce, recordPayment: (a: unknown) => record(a), createTradingPeriod: vi.fn(), saveTradingSettings: vi.fn() }));
vi.mock('@/lib/business.functions', () => ({ getBusinessAccess: async () => ({ branches: [{ id: '33333333-3333-4333-8333-333333333333', name: 'Main', is_active: true }] }), listBusinesses: async () => [{ id: '55555555-5555-4555-8555-555555555555', name: 'Auraluxe', role: 'owner' }] }));
vi.mock('@/lib/inventory.functions', () => ({ getInventory: async () => ({ movements: [], variants: [], parties: [
  { id: 'p1', name: 'Ram Traders', phone: '9800000000', kind: 'customer', is_active: true },
  { id: 'p2', name: 'Sita Supplies', phone: '', kind: 'supplier', is_active: true },
] }) }));
vi.mock('@/lib/inventory-queries', () => ({ businessQuery: { queryKey: ['businesses'], queryFn: async () => [{ id: '55555555-5555-4555-8555-555555555555', name: 'Auraluxe', role: 'owner' }] } }));
vi.mock('@/components/trading-settings', () => ({ TradingSettings: () => null }));

import { Parties } from '@/components/parties';

function mount(url = '/parties') {
  const root = createRootRoute({ component: Parties });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: [url] }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}

describe('Parties page', () => {
  beforeEach(() => { record.mockClear(); acct.tagged.mockClear(); acct.list = []; localStorage.clear(); });

  it('shows totals and balances for customers and suppliers', async () => {
    mount();
    expect(await screen.findByText('Ram Traders')).toBeInTheDocument();
    expect(screen.getAllByText(/Rs\. 600\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rs\. 700\.00/).length).toBeGreaterThan(0);
  });

  it('receives a payment against the unpaid invoice through the existing payment function', async () => {
    mount('/parties?party=p1');
    await screen.findByRole('heading', { name: 'Ram Traders' });
    fireEvent.click(await screen.findByRole('button', { name: /Receive payment/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Full' }));
    fireEvent.change(within(dialog).getByLabelText('Payment method'), { target: { value: 'bank' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm/ }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    const sent = (record.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(sent).toMatchObject({ documentId: '11111111-1111-4111-8111-111111111111', amount: 600, method: 'bank', businessId: '55555555-5555-4555-8555-555555555555', periodId: '44444444-4444-4444-8444-444444444444', sessionId: null });
  });

  it('lets you pick the customer when paying from the list page', async () => {
    mount();
    await screen.findByText('Ram Traders');
    fireEvent.click(screen.getByRole('button', { name: /Receive payment/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Payment party'), { target: { value: 'p1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Full' }));
    fireEvent.change(within(dialog).getByLabelText('Payment method'), { target: { value: 'wallet' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm/ }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect((record.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({ documentId: '11111111-1111-4111-8111-111111111111', amount: 600, method: 'wallet' });
  });

  it('records the payment against the chosen bank account', async () => {
    acct.list = [{ id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', name: 'Himalayan Bank', kind: 'bank', isActive: true, balance: 100 }, { id: 'aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa', name: 'eSewa', kind: 'wallet', isActive: true, balance: 0 }];
    mount('/parties?party=p1');
    await screen.findByRole('heading', { name: 'Ram Traders' });
    fireEvent.click(await screen.findByRole('button', { name: /Receive payment/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Payment account')).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Payment method'), { target: { value: 'bank' } });
    const pick = await within(dialog).findByLabelText('Payment account');
    expect(within(pick).getAllByRole('option').map(o => o.textContent)).toEqual(['Not assigned', 'Himalayan Bank']);
    fireEvent.change(pick, { target: { value: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Full' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm/ }));
    await waitFor(() => expect(acct.tagged).toHaveBeenCalledTimes(1));
    expect(record).not.toHaveBeenCalled();
    expect((acct.tagged.mock.calls[0]![0] as { data: { accountId: string; request: Record<string, unknown> } }).data).toMatchObject({ accountId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', request: { method: 'bank', amount: 600 } });
  });
  it('blocks a cash payment when no cash counter is open', async () => {
    mount('/parties?party=p1');
    await screen.findByRole('heading', { name: 'Ram Traders' });
    fireEvent.click(await screen.findByRole('button', { name: /Receive payment/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Full' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/cash counter/i);
    expect(record).not.toHaveBeenCalled();
  });
});
