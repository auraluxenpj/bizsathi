import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { todayAd } from '@/lib/format';

const ID = { biz: '55555555-5555-4555-8555-555555555555', br: '33333333-3333-4333-8333-333333333333', per: '44444444-4444-4444-8444-444444444444', user: '66666666-6666-4666-8666-666666666666', v1: '77777777-7777-4777-8777-777777777777', p1: '88888888-8888-4888-8888-888888888888' };
const SESSION = '99999999-9999-4999-8999-999999999999';
const state = { counter: true, periods: [{ id: ID.per, name: 'FY test', status: 'open', start_date: '2020-01-01', end_date: '2099-12-31' }] as { id: string; name: string; status: string; start_date: string; end_date: string }[] };
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
Element.prototype.scrollIntoView = () => {};
const auth = vi.hoisted(() => ({ user: { email: 'vikky@example.com', user_metadata: { full_name: 'Vikky' } } as { email: string; user_metadata: Record<string, string> } | null }));
const confirm = vi.fn(async (_: unknown) => ({ id: '99999999-9999-4999-8999-999999999999' }));
const createPeriod = vi.fn(async (_: unknown) => ({ ok: true }));
const counter = vi.fn(async (_: unknown) => { state.counter = true; return 'ok'; });

const commerce = () => ({
  userId: ID.user, role: 'owner', counters: state.counter ? [{ kind: 'open', branch_id: ID.br, actor_id: ID.user, session_id: SESSION }] : [], memberships: [], loyalty: [], documents: [], payments: [],
  settings: { vat_registered: false, vat_rate: 0, currency: 'NPR' }, business: { name: 'Auraluxe', legal_name: 'Auraluxe Private limited', pan_vat_number: '' },
  journals: [{ account_code: 'cash', debit: 5000, credit: 0, entry_date: todayAd(), branch_id: ID.br }, { account_code: 'receivable', debit: 1200, credit: 0, entry_date: todayAd(), branch_id: ID.br }],
  periods: state.periods,
});

vi.mock('@tanstack/react-start', () => ({ useServerFn: (f: unknown) => f, createServerFn: () => { throw new Error('not used'); } }));
vi.mock('@/lib/commerce.functions', () => ({ getCommerce: async () => commerce(), confirmDocument: (a: unknown) => confirm(a), findCommerceDocument: vi.fn(), createTradingPeriod: (a: unknown) => createPeriod(a), recordCounter: (a: unknown) => counter(a), recordPayment: vi.fn(), saveTradingSettings: vi.fn() }));
vi.mock('@/lib/business.functions', () => ({ getBusinessAccess: async () => ({ branches: [{ id: ID.br, name: 'Main', is_active: true }] }), listBusinesses: async () => [{ id: ID.biz, name: 'Auraluxe', role: 'owner' }] }));
vi.mock('@/lib/inventory.functions', () => ({ getInventory: async () => ({
  movements: [{ variant_id: ID.v1, branch_id: ID.br, quantity: 3 }],
  variants: [{ id: ID.v1, sku: 'AL-001', barcode: '', name: 'Large', unit: 'pcs', selling_price: 1500, reorder_level: 5, is_active: true, products: { name: 'Silk Saree', is_active: true } }],
  parties: [{ id: ID.p1, name: 'Ram Traders', phone: '9800000000', kind: 'customer', is_active: true }],
}) }));
vi.mock('@/lib/inventory-queries', () => ({ businessQuery: { queryKey: ['businesses'], queryFn: async () => [{ id: ID.biz, name: 'Auraluxe', role: 'owner' }] } }));
vi.mock('@/lib/vouchers.functions', () => ({ getVoucherWorkspace: async () => ({ userId: ID.user, role: 'owner', branches: [{ id: ID.br, name: 'Main' }], periods: state.periods, vouchers: [] }), postVoucher: vi.fn(), checkVoucher: vi.fn() }));
vi.mock('@/components/trading-settings', () => ({ TradingSettings: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: auth.user } }), signOut: vi.fn() } } }));
vi.mock('@/integrations/lovable', () => ({ lovable: { auth: { signInWithOAuth: vi.fn() } } }));
vi.mock('@lovable.dev/cloud-auth-js/styles.css', () => ({}));

import { Dashboard } from '@/components/dashboard';
import { AppNavigation } from '@/components/app-navigation';
import { SignIn } from '@/components/sign-in';
import { DocumentEditor } from '@/components/document-editor';
import { CashCounters } from '@/components/cash-counters';
import { VoucherWorkspace } from '@/components/voucher-workspace';
import { useCommerce } from '@/components/commerce-workspace';
import { Pos } from '@/components/pos';

function mount(ui: ReactNode, url = '/') {
  const root = createRootRoute({ component: () => <>{ui}</> });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: [url] }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}
function SaleEditor() {
  const w = useCommerce();
  return w.commerce.data && w.inventory.data && w.access.data ? <DocumentEditor w={w} kind="sale" onSaved={() => {}} /> : <p>loading</p>;
}
const noOpenPeriodLabel = () => expect(screen.queryByText(/open period/i)).not.toBeInTheDocument();

beforeEach(() => { auth.user = { email: 'vikky@example.com', user_metadata: { full_name: 'Vikky' } }; confirm.mockClear(); createPeriod.mockClear(); counter.mockClear(); sessionStorage.clear(); state.counter = true; state.periods = [{ id: ID.per, name: 'FY test', status: 'open', start_date: '2020-01-01', end_date: '2099-12-31' }]; });

describe('Dashboard', () => {
  it('shows the Karobar-style cards, chart and quick actions', async () => {
    mount(<Dashboard />);
    expect(await screen.findByText('Welcome Vikky')).toBeInTheDocument();
    for (const t of ['To Receive', 'To Give', 'Total Balance (Cash & Bank)']) expect(screen.getByText(t)).toBeInTheDocument();
    expect(screen.getByText(/^Sales \(/)).toBeInTheDocument();
    expect(screen.getByText(/^Purchase \(/)).toBeInTheDocument();
    expect(screen.getByText(/^Expense \(/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Quick POS/ }).length).toBeGreaterThan(0);
    expect(await screen.findByText('Low stock (1)')).toBeInTheDocument();
    expect(await screen.findAllByText(/Rs\. 1,200\.00/)).not.toHaveLength(0);
  });
  it('hides amounts in privacy mode', async () => {
    mount(<Dashboard />);
    await screen.findAllByText(/Rs\. 1,200\.00/);
    fireEvent.click(screen.getByRole('switch', { name: 'Privacy mode' }));
    await waitFor(() => expect(screen.queryByText(/Rs\. 1,200\.00/)).not.toBeInTheDocument());
  });
});

describe('Navigation and sign-in', () => {
  it('has the sidebar sections, and ⌘K opens exactly one search box', async () => {
    mount(<AppNavigation pathname="/dashboard"><p>page body</p></AppNavigation>);
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    for (const n of ['Dashboard', 'Parties', 'Inventory', 'Sales', 'Purchase', 'Expense', 'Reports', 'Manage Staff']) expect(within(nav).getByText(n)).toBeInTheDocument();
    expect((await screen.findAllByText('Auraluxe', { selector: 'span' })).length).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findAllByPlaceholderText(/Search pages or create/)).toHaveLength(1);
  });
  it('renders a simple sign-in card', async () => {
    auth.user = null;
    mount(<SignIn />);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
  });
});

describe('Sale editor', () => {
  it('has no period dropdown and posts with the period found from the date', async () => {
    mount(<SaleEditor />);
    const search = await screen.findByLabelText('Product search or barcode');
    noOpenPeriodLabel();
    fireEvent.change(search, { target: { value: 'saree' } });
    fireEvent.click(await screen.findByRole('button', { name: /Silk Saree/ }));
    fireEvent.change(screen.getByLabelText('Customer mobile'), { target: { value: '9812345678' } });
    fireEvent.click(screen.getByRole('button', { name: cashButton }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Confirm sale/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    const sent = (confirm.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(sent).toMatchObject({ businessId: ID.biz, branchId: ID.br, periodId: ID.per, kind: 'sale', status: 'confirmed' });
    expect(sent['payments']).toMatchObject([{ method: 'cash', amount: 1500, sessionId: SESSION }]);
    expect(sent['lines']).toMatchObject([{ variantId: ID.v1, quantity: 1, price: 1500 }]);
  });
  it('offers to create the Nepal fiscal year when none is open', async () => {
    state.periods = [];
    mount(<SaleEditor />);
    await screen.findByLabelText('Product search or barcode');
    expect(screen.getByRole('alert')).toHaveTextContent(/No open financial year/);
    noOpenPeriodLabel();
    expect(screen.getByRole('button', { name: /Confirm sale/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Create FY/ }));
    await waitFor(() => expect(createPeriod).toHaveBeenCalledTimes(1));
    const sent = (createPeriod.mock.calls[0]![0] as { data: { name: string; start: string; end: string; businessId: string } }).data;
    expect(sent.name).toMatch(/^FY 20\d\d\/\d\d$/);
    expect(sent.start <= todayAd() && todayAd() <= sent.end).toBe(true);
    expect(sent.businessId).toBe(ID.biz);
  });
});

describe('Why a sale cannot be confirmed', () => {
  const addSaree = async () => { fireEvent.change(await screen.findByLabelText('Product search or barcode'), { target: { value: 'saree' } }); fireEvent.click(await screen.findByRole('button', { name: /Silk Saree/ })); fireEvent.change(screen.getByLabelText('Customer mobile'), { target: { value: '9812345678' } }); };
  const why = () => screen.getByLabelText('Why this cannot be confirmed yet');
  it('a walk-in sale that is not paid says it must be paid in full, and a chosen customer allows credit', async () => {
    mount(<SaleEditor />); await addSaree();
    expect(why()).toHaveTextContent(/must be paid in full/);
    expect(screen.getByRole('button', { name: /Confirm sale/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Document contact'), { target: { value: ID.p1 } });
    await waitFor(() => expect(screen.queryByLabelText('Why this cannot be confirmed yet')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Confirm sale/ })).toBeEnabled();
  });
  it('cash without an open counter explains it and opens the counter in one tap', async () => {
    state.counter = false; mount(<SaleEditor />); await addSaree();
    fireEvent.click(screen.getByRole('button', { name: /^Cash$/ }));
    expect(why()).toHaveTextContent(/cash counter open/);
    expect(screen.getByRole('button', { name: /Confirm sale/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Open my cash counter' }));
    await waitFor(() => expect(counter).toHaveBeenCalledTimes(1));
    expect((counter.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({ businessId: ID.biz, branchId: ID.br, periodId: ID.per, kind: 'open', amount: 0 });
    await waitFor(() => expect(screen.getByRole('button', { name: /Confirm sale/ })).toBeEnabled());
  });
  it('warns on the line and blocks Confirm when an item has less stock than the quantity', async () => {
    mount(<SaleEditor />); await addSaree();
    fireEvent.click(screen.getByRole('button', { name: /^Cash$/ }));
    fireEvent.change(screen.getByLabelText('quantity line 1'), { target: { value: '5' } });
    expect(await screen.findByText('Only 3 in stock here.')).toBeInTheDocument();
    expect(why()).toHaveTextContent(/Not enough stock for Silk Saree \(3 in stock here\)/);
    expect(screen.getByRole('button', { name: /Confirm sale/ })).toBeDisabled();
  });
});

describe('Point of sale', () => {
  it('is a standalone sale screen with no device passphrase', async () => {
    mount(<Pos />);
    expect(await screen.findByRole('heading', { name: /Point of sale/ })).toBeInTheDocument();
    expect(await screen.findByLabelText('Product search or barcode')).toBeInTheDocument();
    expect(screen.queryByText(/passphrase/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/unlock/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('href', '/dashboard');
    noOpenPeriodLabel();
  });
  it('sells through the same confirmation as Sales', async () => {
    mount(<Pos />);
    fireEvent.change(await screen.findByLabelText('Product search or barcode'), { target: { value: 'AL-001' } });
    fireEvent.keyDown(screen.getByLabelText('Product search or barcode'), { key: 'Enter' });
    fireEvent.change(await screen.findByLabelText('Customer mobile'), { target: { value: '9812345678' } });
    fireEvent.click(screen.getByRole('button', { name: /^Cash$/ }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Confirm sale/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect((confirm.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({ kind: 'sale', status: 'confirmed', periodId: ID.per });
    expect(await screen.findByText('Sale saved')).toBeInTheDocument();
  });
});

describe('Other screens have no period dropdown', () => {
  it('cash counters', async () => {
    mount(<CashCounters />);
    await screen.findByLabelText('Counter amount');
    noOpenPeriodLabel();
    expect(screen.queryByLabelText('Counter period')).not.toBeInTheDocument();
  });
  it('expense vouchers', async () => {
    mount(<VoucherWorkspace businessId={ID.biz} />);
    await screen.findByLabelText('Voucher date');
    noOpenPeriodLabel();
  });
});

const cashButton = /^Cash$/;
