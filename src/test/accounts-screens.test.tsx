import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ID = { biz: '55555555-5555-4555-8555-555555555555', br: '33333333-3333-4333-8333-333333333333', per: '44444444-4444-4444-8444-444444444444', user: '66666666-6666-4666-8666-666666666666' };
const A = { bank: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', safe: 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa', wallet: 'aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa' };
const ctx = vi.hoisted(() => ({ role: 'owner', list: [] as { id: string; name: string; kind: string; isActive: boolean; balance: number }[], unassigned: { cash: 0, bank: 0, wallet: 0 } }));
const fns = vi.hoisted(() => ({ create: vi.fn(async (_: unknown) => ({ id: 'x' })), adjust: vi.fn(async (_: unknown) => ({ id: 'x' })), transfer: vi.fn(async (_: unknown) => ({ id: 'x' })), balances: vi.fn() }));
const commerce = () => ({ userId: ID.user, role: ctx.role, counters: [], documents: [], payments: [], memberships: [], loyalty: [], settings: { vat_registered: false, vat_rate: 0, currency: 'NPR' }, business: { name: 'Auraluxe', legal_name: 'Auraluxe', pan_vat_number: '' },
  journals: [{ account_code: 'cash', debit: 700, credit: 0, entry_date: '2026-11-01', branch_id: ID.br }, { account_code: 'bank', debit: 1500, credit: 0, entry_date: '2026-11-01', branch_id: ID.br }],
  periods: [{ id: ID.per, name: 'FY', status: 'open', start_date: '2020-01-01', end_date: '2099-12-31' }] });
vi.mock('@tanstack/react-start', () => ({ useServerFn: (f: unknown) => f, createServerFn: () => { throw new Error('not used'); } }));
vi.mock('@/lib/commerce.functions', () => ({ getCommerce: async () => commerce(), createTradingPeriod: vi.fn(), confirmDocument: vi.fn(), findCommerceDocument: vi.fn(), recordCounter: vi.fn(), recordPayment: vi.fn(), saveTradingSettings: vi.fn() }));
vi.mock('@/lib/business.functions', () => ({ getBusinessAccess: async () => ({ branches: [{ id: ID.br, name: 'Main', is_active: true }] }), listBusinesses: async () => [{ id: ID.biz, name: 'Auraluxe', role: ctx.role }] }));
vi.mock('@/lib/inventory.functions', () => ({ getInventory: async () => ({ movements: [], variants: [], parties: [] }) }));
vi.mock('@/lib/inventory-queries', () => ({ businessQuery: { queryKey: ['businesses'], queryFn: async () => [{ id: ID.biz, name: 'Auraluxe', role: ctx.role }] } }));
vi.mock('@/components/trading-settings', () => ({ TradingSettings: () => null }));
vi.mock('@/lib/accounts.functions', () => ({ getAccountBalances: (a: unknown) => { fns.balances(a); return Promise.resolve({ accounts: ctx.list, unassigned: ctx.unassigned }); }, createAccount: (a: unknown) => fns.create(a), adjustAccount: (a: unknown) => fns.adjust(a), transferBetweenAccounts: (a: unknown) => fns.transfer(a), confirmDocumentTagged: vi.fn(), recordPaymentTagged: vi.fn(), postVoucherTagged: vi.fn() }));
import { CashBank } from '@/components/cash-bank';

function mount() {
  const root = createRootRoute({ component: CashBank });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) });
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
}
const seed = () => { ctx.list = [{ id: A.bank, name: 'Himalayan Bank', kind: 'bank', isActive: true, balance: 50000 }, { id: A.safe, name: 'Home Safe', kind: 'cash', isActive: true, balance: 10000 }, { id: A.wallet, name: 'eSewa', kind: 'wallet', isActive: true, balance: 0 }]; ctx.unassigned = { cash: 700, bank: 1500, wallet: 0 }; };
beforeEach(() => { ctx.role = 'owner'; ctx.list = []; ctx.unassigned = { cash: 0, bank: 0, wallet: 0 }; Object.values(fns).forEach(f => f.mockClear()); });

describe('Cash & Bank accounts', () => {
  it('lists named accounts with balances, the money not yet in an account, and the overall total', async () => {
    seed(); mount();
    expect(await screen.findByText('Himalayan Bank')).toBeInTheDocument();
    expect(screen.getByText('Home Safe')).toBeInTheDocument(); expect(screen.getByText('Rs. 50,000.00')).toBeInTheDocument();
    expect(screen.getByText('Cash in counters and other')).toBeInTheDocument(); expect(screen.getByText(/Bank \(not in a named account\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Digital wallet \(not in a named account\)/)).not.toBeInTheDocument();
    expect(screen.getByText('Rs. 62,200.00')).toBeInTheDocument();
  });
  it('creates an account with an opening balance in the open financial year', async () => {
    seed(); mount(); fireEvent.click(await screen.findByRole('button', { name: /New account/ }));
    const d = await screen.findByRole('dialog'); const create = within(d).getByRole('button', { name: 'Create account' });
    expect(create).toBeDisabled();
    fireEvent.change(within(d).getByLabelText('Account name'), { target: { value: 'Khalti' } });
    fireEvent.change(within(d).getByLabelText('Account type'), { target: { value: 'wallet' } });
    fireEvent.change(within(d).getByLabelText('Opening balance'), { target: { value: '2500.50' } });
    await waitFor(() => expect(create).toBeEnabled()); fireEvent.click(create);
    await waitFor(() => expect(fns.create).toHaveBeenCalledTimes(1));
    expect((fns.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({ businessId: ID.biz, branchId: ID.br, periodId: ID.per, name: 'Khalti', kind: 'wallet', opening: '2500.50' });
  });
  it('refuses a bad opening balance and shows the server reason when creating fails', async () => {
    seed(); fns.create.mockRejectedValueOnce(new Error('An account with this name already exists.'));
    mount(); fireEvent.click(await screen.findByRole('button', { name: /New account/ }));
    const d = await screen.findByRole('dialog');
    fireEvent.change(within(d).getByLabelText('Account name'), { target: { value: 'Himalayan Bank' } });
    fireEvent.change(within(d).getByLabelText('Opening balance'), { target: { value: '12.345' } });
    expect(within(d).getByRole('button', { name: 'Create account' })).toBeDisabled();
    fireEvent.change(within(d).getByLabelText('Opening balance'), { target: { value: '100' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Create account' }));
    expect(await within(d).findByText('An account with this name already exists.')).toBeInTheDocument();
  });
  it('adjusts a balance to the figure you type', async () => {
    seed(); mount(); fireEvent.click(await screen.findByRole('button', { name: 'Adjust Himalayan Bank' }));
    const d = await screen.findByRole('dialog'); const save = within(d).getByRole('button', { name: 'Save adjustment' });
    expect(within(d).getByLabelText('Correct balance')).toHaveValue('50000'); expect(save).toBeDisabled();
    fireEvent.change(within(d).getByLabelText('Correct balance'), { target: { value: '48250.75' } });
    await waitFor(() => expect(save).toBeEnabled()); fireEvent.click(save);
    await waitFor(() => expect(fns.adjust).toHaveBeenCalledTimes(1));
    expect((fns.adjust.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({ accountId: A.bank, target: '48250.75', businessId: ID.biz, periodId: ID.per });
  });
  it('transfers between accounts but never more than the account holds', async () => {
    seed(); mount(); fireEvent.click(await screen.findByRole('button', { name: 'Transfer from Home Safe' }));
    const d = await screen.findByRole('dialog'); const go = within(d).getByRole('button', { name: 'Transfer' });
    fireEvent.change(within(d).getByLabelText('Transfer to'), { target: { value: A.bank } });
    fireEvent.change(within(d).getByLabelText('Transfer amount'), { target: { value: '10000.01' } });
    expect(within(d).getByText(/more than the account holds/)).toBeInTheDocument(); expect(go).toBeDisabled();
    fireEvent.change(within(d).getByLabelText('Transfer amount'), { target: { value: '4000' } });
    await waitFor(() => expect(go).toBeEnabled()); fireEvent.click(go);
    await waitFor(() => expect(fns.transfer).toHaveBeenCalledTimes(1));
    expect((fns.transfer.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({ fromAccountId: A.safe, toAccountId: A.bank, amount: '4000', businessId: ID.biz });
  });
  it('people below accountant see only the overall balances and cannot manage accounts', async () => {
    ctx.role = 'staff'; seed(); mount();
    expect(await screen.findByText('Overall Account Balance')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New account/ })).not.toBeInTheDocument(); expect(screen.queryByText('Himalayan Bank')).not.toBeInTheDocument();
    expect(fns.balances).not.toHaveBeenCalled();
  });
});
