vi.mock('@/lib/sales-cash-flow.functions',()=>({getPaymentQr:async()=>({url:null,provider:'',payee:'',instructions:''}),saveCreditLimit:vi.fn(),savePaymentQr:vi.fn()}));
vi.mock('@/lib/product-images.functions',()=>({listProductImages:async()=>({images:{}}),setProductImage:vi.fn()}));
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/components/screen-lock', () => ({ ScreenLockButton: () => null }));
import { todayAd } from '@/lib/format';

const ID = { biz: '55555555-5555-4555-8555-555555555555', br: '33333333-3333-4333-8333-333333333333', per: '44444444-4444-4444-8444-444444444444', user: '66666666-6666-4666-8666-666666666666', v1: '77777777-7777-4777-8777-777777777777', v2: '77777777-7777-4777-8777-777777777778', prod1: '88888888-8888-4888-8888-888888888887', prod2: '88888888-8888-4888-8888-888888888886', p1: '88888888-8888-4888-8888-888888888888' };
const SESSION = '99999999-9999-4999-8999-999999999999';
const state = { counter: true, vatRegistered: false, vatRate: 0, periods: [{ id: ID.per, name: 'FY test', status: 'open', start_date: '2020-01-01', end_date: '2099-12-31' }] as { id: string; name: string; status: string; start_date: string; end_date: string }[] };
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
Element.prototype.scrollIntoView = () => {};
const auth = vi.hoisted(() => ({ user: { email: 'vikky@example.com', user_metadata: { full_name: 'Vikky' } } as { email: string; user_metadata: Record<string, string> } | null }));
const ACC = { bank: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', bank2: 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa', wallet: 'aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa' };
const acct = vi.hoisted(() => ({ list: [] as { id: string; name: string; kind: string; isActive: boolean; balance: number }[], tagged: vi.fn(async (_: unknown) => ({ id: '99999999-9999-4999-8999-999999999990' })), voucher: vi.fn(async (_: unknown) => ({ id: 'v1' })) }));
const confirm = vi.fn(async (_: unknown) => ({ id: '99999999-9999-4999-8999-999999999999' }));
const createPeriod = vi.fn(async (_: unknown) => ({ ok: true }));
const counter = vi.fn(async (_: unknown) => { state.counter = true; return 'ok'; });

const commerce = () => ({
  userId: ID.user, role: 'owner', counters: state.counter ? [{ kind: 'open', branch_id: ID.br, actor_id: ID.user, session_id: SESSION }] : [], memberships: [], loyalty: [], documents: [], payments: [],
  settings: { vat_registered: state.vatRegistered, vat_rate: state.vatRate, currency: 'NPR' }, business: { name: 'Auraluxe', legal_name: 'Auraluxe Private limited', pan_vat_number: '' },
  journals: [{ account_code: 'cash', debit: 5000, credit: 0, entry_date: todayAd(), branch_id: ID.br }, { account_code: 'receivable', debit: 1200, credit: 0, entry_date: todayAd(), branch_id: ID.br }],
  periods: state.periods,
});

vi.mock('@tanstack/react-start', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tanstack/react-start')>()), useServerFn: (f: unknown) => f }));
vi.mock('@/components/permission-checklist',()=>({useCan:()=>()=>true,PermissionChecklist:()=>null,usePermissionDenials:()=>({data:{userId:'test-user',denials:[],roleDenials:[]},isSuccess:true})}));
vi.mock('@/lib/commerce.functions', () => ({ getLoyaltyBalance:async()=>({points:0}),getCommerce: async () => commerce(), confirmDocument: (a: unknown) => confirm(a), findCommerceDocument: vi.fn(), createTradingPeriod: (a: unknown) => createPeriod(a), recordCounter: (a: unknown) => counter(a), recordPayment: vi.fn(), saveTradingSettings: vi.fn() }));
vi.mock('@/lib/accounts.functions', () => ({ getAccountBalances: async () => ({ accounts: acct.list, unassigned: { cash: 0, bank: 0, wallet: 0 } }), confirmDocumentTagged: (a: unknown) => acct.tagged(a), recordPaymentTagged: vi.fn(), postVoucherTagged: (a: unknown) => acct.voucher(a), createAccount: vi.fn(), adjustAccount: vi.fn(), transferBetweenAccounts: vi.fn() }));
vi.mock('@/lib/business.functions', () => ({ reissueInvitation: vi.fn(), getMemberPermissions:async()=>({userId:ID.user,denials:[]}), getBusinessAccess: async () => ({ branches: [{ id: ID.br, name: 'Main', is_active: true }] }), listBusinesses: async () => [{ id: ID.biz, name: 'Auraluxe', role: 'owner' }] }));
vi.mock('@/lib/inventory.functions', () => ({ getInventory: async () => ({
  movements: [{ variant_id: ID.v1, branch_id: ID.br, quantity: 3 }, { variant_id: ID.v2, branch_id: ID.br, quantity: 4 }],
  variants: [
    { id: ID.v1, product_id: ID.prod1, sku: 'AL-001', barcode: '', name: 'Large', unit: 'pcs', selling_price: 1500, reorder_level: 5, is_active: true, products: { name: 'Silk Saree', is_active: true } },
    { id: ID.v2, product_id: ID.prod2, sku: 'AL-002', barcode: '', name: 'Standard', unit: 'pcs', selling_price: 900, reorder_level: 5, is_active: true, products: { name: 'Cotton Kurti', is_active: true } },
  ],
  parties: [{ id: ID.p1, name: 'Ram Traders', phone: '9800000000', kind: 'customer', is_active: true }],
}) }));
vi.mock('@/lib/inventory-queries', () => ({ businessQuery: { queryKey: ['businesses'], queryFn: async () => [{ id: ID.biz, name: 'Auraluxe', role: 'owner' }] } }));
vi.mock('@/lib/vouchers.functions', () => ({ getVoucherWorkspace: async () => ({ userId: ID.user, role: 'owner', branches: [{ id: ID.br, name: 'Main' }], periods: state.periods, vouchers: [] }), postVoucher: vi.fn(), checkVoucher: vi.fn() }));
vi.mock('@/components/trading-settings', () => ({ TradingSettings: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ isSupabaseConfigured: () => true, supabase: { auth: { getUser: async () => ({ data: { user: auth.user } }), signOut: vi.fn() } } }));

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
async function addCatalogSaree() {
  const search = await screen.findByLabelText('Product search or barcode');
  fireEvent.change(search, { target: { value: 'saree' } });
  const heading = await screen.findByRole('heading', { name: 'Silk Saree' });
  const card = heading.closest('article');
  if (!card) throw new Error('Silk Saree product card was not rendered');
  fireEvent.click(within(card).getByRole('button', { name: /\+ Add/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue to checkout' }));
}
function payFullTestBalance(amount = '1500') { fireEvent.change(screen.getByLabelText('Payment amount 1'), { target: { value: amount } }); }
function SaleEditor() {
  const w = useCommerce();
  return w.commerce.data && w.inventory.data && w.access.data ? <DocumentEditor w={w} kind="sale" onSaved={() => {}} /> : <p>loading</p>;
}
const noOpenPeriodLabel = () => expect(screen.queryByText(/open period/i)).not.toBeInTheDocument();

beforeEach(() => { acct.list = []; acct.tagged.mockClear(); acct.voucher.mockClear(); localStorage.clear(); auth.user = { email: 'vikky@example.com', user_metadata: { full_name: 'Vikky' } }; confirm.mockClear(); createPeriod.mockClear(); counter.mockClear(); sessionStorage.clear(); state.counter = true; state.vatRegistered = false; state.vatRate = 0; state.periods = [{ id: ID.per, name: 'FY test', status: 'open', start_date: '2020-01-01', end_date: '2099-12-31' }]; });

describe('Dashboard', () => {
  it('shows the Karobar-style cards, chart and quick actions', async () => {
    mount(<Dashboard />);
    expect(await screen.findByRole('heading',{name:'Business overview'})).toBeInTheDocument();
    for (const t of ['To receive', 'To pay', 'Cash & bank']) expect(screen.getByText(t)).toBeInTheDocument();
    expect(screen.getAllByText('Net sales')[0]).toBeInTheDocument();
    expect(screen.getByText('Purchases')).toBeInTheDocument();
    expect(screen.getAllByText('Operating expenses')[0]).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Barcode POS/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('region', { name: 'Inventory health' })).toHaveLength(2);
    expect(await screen.findAllByText(/Rs\. 1,200\.00/)).not.toHaveLength(0);
  });
  it('hides amounts in privacy mode', async () => {
    mount(<Dashboard />);
    await screen.findAllByText(/Rs\. 1,200\.00/);
    fireEvent.click(screen.getAllByRole('switch', { name: 'Privacy mode' })[0]!);
    await waitFor(() => expect(screen.queryByText(/Rs\. 1,200\.00/)).not.toBeInTheDocument());
  });
});

describe('Navigation and sign-in', () => {
  it('has the sidebar sections, and ⌘K opens exactly one search box', async () => {
    mount(<AppNavigation pathname="/dashboard"><p>page body</p></AppNavigation>);
    fireEvent.click(await screen.findByRole('button', { name: 'Open navigation menu' }));
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    for (const n of ['Dashboard', 'Sales & POS', 'Purchases', 'Stock & Inventory', 'Customers & Loyalty', 'Finance', 'Reporting', 'HR & People Management', 'Settings', 'Security']) expect(within(nav).getByText(n)).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole('button', { name: /Customers & Loyalty/ }));
    expect(await within(nav).findByText('Customers')).toBeInTheDocument();
    expect((await screen.findAllByText('Auraluxe', { selector: 'span' })).length).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findAllByPlaceholderText(/Search products, parties, vouchers or pages/)).toHaveLength(1);
  });
  it('renders a simple sign-in card', async () => {
    auth.user = null;
    mount(<SignIn />);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Email me a sign-in link/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
  });
});

describe('Billing journey: VAT and split tender', () => {
  it('uses the configured VAT rate in the sale request and checkout amount', async () => {
    state.vatRegistered = true; state.vatRate = 13;
    mount(<SaleEditor />);
    fireEvent.change(await screen.findByLabelText('Customer name'), { target: { value: 'Walk-in Customer' } });
    fireEvent.change(await screen.findByLabelText('Customer mobile'), { target: { value: '9812345678' } });
    await addCatalogSaree();
    fireEvent.click(screen.getByRole('button', { name: /^Cash$/ }));
    payFullTestBalance('1695');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Confirm sale/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    const sent = (confirm.mock.calls[0]![0] as { data: { lines: { price: number; taxRate: number }[]; payments: { amount: number }[] } }).data;
    expect(sent.lines).toMatchObject([{ price: 1500, taxRate: 13 }]);
    expect(sent.payments).toMatchObject([{ amount: 1695 }]);
  });

  it('posts cash and bank as separate split payments with the bank transaction reference', async () => {
    mount(<SaleEditor />);
    fireEvent.change(await screen.findByLabelText('Customer name'), { target: { value: 'Walk-in Customer' } });
    fireEvent.change(await screen.findByLabelText('Customer mobile'), { target: { value: '9812345678' } });
    await addCatalogSaree();
    fireEvent.click(screen.getByRole('button', { name: /^Cash$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Split Payment' }));
    fireEvent.change(screen.getByLabelText('Payment amount 1'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /^Bank Transfer$/ }));
    fireEvent.change(screen.getByLabelText('Payment amount 2'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Payment reference 2'), { target: { value: 'UTR-SPLIT-01' } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Confirm sale/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    const sent = (confirm.mock.calls[0]![0] as { data: { payments: { method: string; amount: number; reference: string; sessionId: string | null }[] } }).data;
    expect(sent.payments).toMatchObject([
      { method: 'cash', amount: 500, sessionId: SESSION },
      { method: 'bank', amount: 1000, reference: 'UTR-SPLIT-01', sessionId: null },
    ]);
  });
});

describe('Sale editor', () => {
  it('has no period dropdown and posts with the period found from the date', async () => {
    mount(<SaleEditor />);
    fireEvent.change(await screen.findByLabelText('Customer name'), { target: { value: 'Walk-in Customer' } }); fireEvent.change(await screen.findByLabelText('Customer mobile'), { target: { value: '9812345678' } });
    const search = await screen.findByLabelText('Product search or barcode');
    noOpenPeriodLabel();
    fireEvent.change(search, { target: { value: 'saree' } });
    await addCatalogSaree();
    fireEvent.change(screen.getByLabelText('Customer mobile'), { target: { value: '9812345678' } });
    fireEvent.click(screen.getByRole('button', { name: cashButton })); payFullTestBalance();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Confirm sale/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    const sent = (confirm.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(sent).toMatchObject({ businessId: ID.biz, branchId: ID.br, periodId: ID.per, kind: 'sale', status: 'confirmed' });
    expect(sent['customerName']).toBe('Walk-in Customer');
    expect(sent['payments']).toMatchObject([{ method: 'cash', amount: 1500, sessionId: SESSION }]);
    expect(sent['lines']).toMatchObject([{ variantId: ID.v1, quantity: 1, price: 1500 }]);
  });
  it('fills customer name and mobile when an existing customer is selected', async () => {
    mount(<SaleEditor />);
    await screen.findByLabelText('Customer name');
    fireEvent.change(await screen.findByLabelText('Document contact'), { target: { value: ID.p1 } });
    // Selecting a customer auto-advances to Products; search is required before catalogue items appear.
    fireEvent.change(await screen.findByLabelText('Product search or barcode'), { target: { value: 'saree' } });
    const heading = await screen.findByRole('heading', { name: 'Silk Saree' });
    const card = heading.closest('article');
    if (!card) throw new Error('Silk Saree product card was not rendered');
    fireEvent.click(within(card).getByRole('button', { name: '+ Add' }));
    // The catalogue quantity control does not auto-advance; explicitly open the Checkout step.
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to checkout' }));
    expect(await screen.findByLabelText('Customer name')).toHaveValue('Ram Traders');
    expect(screen.getByLabelText('Customer mobile')).toHaveValue('9800000000');
  });
  it('offers to create the Nepal fiscal year when none is open', async () => {
    state.periods = [];
    mount(<SaleEditor />);
    await screen.findByLabelText('Customer mobile');
    expect(screen.getByRole('alert')).toHaveTextContent(/No open financial year/);
    noOpenPeriodLabel();
    expect(screen.getByRole('button', { name: /Continue to products/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Create FY/ }));
    await waitFor(() => expect(createPeriod).toHaveBeenCalledTimes(1));
    const sent = (createPeriod.mock.calls[0]![0] as { data: { name: string; start: string; end: string; businessId: string } }).data;
    expect(sent.name).toMatch(/^FY 20\d\d\/\d\d$/);
    expect(sent.start <= todayAd() && todayAd() <= sent.end).toBe(true);
    expect(sent.businessId).toBe(ID.biz);
  });
});

describe('Why a sale cannot be confirmed', () => {
  const addSaree = async () => { fireEvent.change(await screen.findByLabelText('Customer name'), { target: { value: 'Walk-in Customer' } }); fireEvent.change(await screen.findByLabelText('Customer mobile'), { target: { value: '9812345678' } }); fireEvent.change(await screen.findByLabelText('Product search or barcode'), { target: { value: 'saree' } }); await addCatalogSaree(); };
  const why = () => screen.getByLabelText('Why this cannot be confirmed yet');
  it('a walk-in sale that is not paid says it must be paid in full, and a chosen customer allows credit', async () => {
    mount(<SaleEditor />); await addSaree();
    expect(why()).toHaveTextContent(/must be paid in full/);
    expect(screen.getByRole('button', { name: /Confirm sale/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Document contact'), { target: { value: ID.p1 } });
    expect(why()).toHaveTextContent(/Confirm Customer Credit/);
    expect(screen.getByRole('button', { name: /Confirm sale/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Customer Credit' }));
    await waitFor(() => expect(screen.queryByLabelText('Why this cannot be confirmed yet')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Customer Credit Approved/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Confirm sale/ })).toBeEnabled();
  });
  it('cash without an open counter explains it and opens the counter in one tap', async () => {
    state.counter = false; mount(<SaleEditor />); await addSaree();
    fireEvent.click(screen.getByRole('button', { name: /^Cash$/ })); payFullTestBalance();
    expect(why()).toHaveTextContent(/cash counter open/);
    expect(screen.getByRole('button', { name: /Confirm sale/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Open my cash counter' }));
    await waitFor(() => expect(counter).toHaveBeenCalledTimes(1));
    expect((counter.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({ businessId: ID.biz, branchId: ID.br, periodId: ID.per, kind: 'open', amount: 0 });
    await waitFor(() => expect(screen.getByRole('button', { name: /Confirm sale/ })).toBeEnabled());
  });
  it('warns on the line and blocks Confirm when an item has less stock than the quantity', async () => {
    mount(<SaleEditor />); await addSaree();
    fireEvent.click(screen.getByRole('button', { name: /^Cash$/ })); payFullTestBalance();
    fireEvent.change(screen.getByLabelText('quantity line 1'), { target: { value: '5' } });
    expect(await screen.findByText('Only 3 in stock here.')).toBeInTheDocument();
    expect(why()).toHaveTextContent(/Not enough stock for Silk Saree \(3 in stock here\)/);
    expect(screen.getByRole('button', { name: /Confirm sale/ })).toBeDisabled();
  });
});

describe('Choosing which account a payment goes to', () => {
  const named = () => { acct.list = [{ id: ACC.bank, name: 'Himalayan Bank', kind: 'bank', isActive: true, balance: 5000 }, { id: ACC.bank2, name: 'NIC Asia', kind: 'bank', isActive: true, balance: 100 }, { id: ACC.wallet, name: 'eSewa', kind: 'wallet', isActive: true, balance: 0 }]; };
  const addSaree = async () => { fireEvent.change(await screen.findByLabelText('Customer name'), { target: { value: 'Walk-in Customer' } }); fireEvent.change(await screen.findByLabelText('Customer mobile'), { target: { value: '9812345678' } }); fireEvent.change(await screen.findByLabelText('Product search or barcode'), { target: { value: 'saree' } }); await addCatalogSaree(); };
  it('tags a bank payment to the chosen account and remembers it for next time', async () => {
    named(); mount(<SaleEditor />); await addSaree();
    fireEvent.click(screen.getByRole('button', { name: /^Bank Transfer$/ }));
    const pick = await screen.findByLabelText('Payment account 1');
    expect(within(pick).getAllByRole('option').map(o => o.textContent)).toEqual(['Not assigned', 'Himalayan Bank', 'NIC Asia']);
    fireEvent.change(pick, { target: { value: ACC.bank2 } }); fireEvent.change(screen.getByLabelText('Payment reference 1'), { target: { value: 'FNP-12345' } }); payFullTestBalance();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Confirm sale/ }));
    await waitFor(() => expect(acct.tagged).toHaveBeenCalledTimes(1));
    expect(confirm).not.toHaveBeenCalled();
    const sent = (acct.tagged.mock.calls[0]![0] as { data: { request: { payments: { id: string; method: string; reference: string }[] }; accounts: { paymentId: string; accountId: string }[] } }).data;
    expect(sent.accounts).toEqual([{ paymentId: sent.request.payments[0]!.id, accountId: ACC.bank2 }]);
    expect(sent.request.payments[0]!.reference).toBe('FNP-12345');
    expect(localStorage.getItem(`bizsathi.account:${ID.biz}:bank`)).toBe(ACC.bank2);
  });
  it('blocks a non-cash payment without a transaction reference and posts the entered reference', async () => {
    mount(<SaleEditor />); await addSaree();
    fireEvent.click(screen.getByRole('button', { name: /^Bank Transfer$/ })); payFullTestBalance();
    expect(screen.getByLabelText('Why this cannot be confirmed yet')).toHaveTextContent(/transaction reference/);
    expect(screen.getByRole('button', { name: /Confirm sale/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Payment reference 1'), { target: { value: 'BANK-UTR-7788' } });
    await waitFor(() => expect(screen.queryByLabelText('Why this cannot be confirmed yet')).not.toBeInTheDocument());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Confirm sale/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    const sent = (confirm.mock.calls[0]![0] as { data: { payments: { reference: string }[] } }).data;
    expect(sent.payments[0]!.reference).toBe('BANK-UTR-7788');
  });
  it('preselects the last account used, and wallet payments only offer wallet accounts', async () => {
    named(); localStorage.setItem(`bizsathi.account:${ID.biz}:wallet`, ACC.wallet);
    mount(<SaleEditor />); await addSaree();
    fireEvent.click(screen.getByRole('button', { name: /^Fonepay \/ QR$/ }));
    const pick = await screen.findByLabelText('Payment account 1') as HTMLSelectElement;
    expect(pick.value).toBe(ACC.wallet); expect(within(pick).getAllByRole('option').map(o => o.textContent)).toEqual(['Not assigned', 'eSewa']);
  });
  it('leaves the payment untagged when no account is chosen, and never offers accounts for counter cash', async () => {
    named(); mount(<SaleEditor />); await addSaree();
    fireEvent.click(screen.getByRole('button', { name: /^Cash$/ })); payFullTestBalance();
    expect(screen.queryByLabelText('Payment account 1')).not.toBeInTheDocument();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Confirm sale/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(acct.tagged).not.toHaveBeenCalled();
  });
  it('shows no account pickers when no accounts exist yet', async () => {
    mount(<SaleEditor />); await addSaree();
    fireEvent.click(screen.getByRole('button', { name: /^Bank Transfer$/ }));
    await waitFor(() => expect(screen.getByLabelText('Payment amount 1')).toBeInTheDocument());
    expect(screen.queryByLabelText('Payment account 1')).not.toBeInTheDocument();
  });
});

describe('Paying an expense from a named account', () => {
  it('posts the expense against the account that was chosen', async () => {
    acct.list = [{ id: ACC.bank, name: 'Himalayan Bank', kind: 'bank', isActive: true, balance: 5000 }, { id: ACC.wallet, name: 'eSewa', kind: 'wallet', isActive: true, balance: 0 }];
    mount(<VoucherWorkspace businessId={ID.biz} />);
    const pick = await screen.findByLabelText('Paid from account');
    expect(within(pick).getAllByRole('option').map(o => o.textContent)).toEqual(['Not assigned', 'Himalayan Bank']);
    fireEvent.change(pick, { target: { value: ACC.bank } });
    fireEvent.change(screen.getByLabelText('Voucher reference'), { target: { value: 'RENT-11' } });
    fireEvent.change(screen.getByLabelText('Voucher reason'), { target: { value: 'Shop rent' } });
    fireEvent.change(screen.getByLabelText('Expense amount'), { target: { value: '4000' } });
    fireEvent.click(screen.getByRole('button', { name: /Review voucher/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm posting' }));
    await waitFor(() => expect(acct.voucher).toHaveBeenCalledTimes(1));
    const sent = (acct.voucher.mock.calls[0]![0] as { data: { accountId: string; request: { kind: string; lines: { account: string; debit: string; credit: string }[] } } }).data;
    expect(sent.accountId).toBe(ACC.bank);
    expect(sent.request).toMatchObject({ kind: 'expense', lines: [{ debit: '4000', credit: '0' }, { account: 'bank', debit: '0', credit: '4000' }] });
  });
  it('has no account picker until accounts exist', async () => {
    mount(<VoucherWorkspace businessId={ID.biz} />);
    await screen.findByLabelText('Voucher reference');
    expect(screen.queryByLabelText('Paid from account')).not.toBeInTheDocument();
  });
});

describe('Point of sale', () => {
  it('shows the full product catalogue immediately and filters it by search', async () => {
    mount(<Pos />);
    fireEvent.change(await screen.findByLabelText('Customer name'), { target: { value: 'Walk-in Customer' } });
    fireEvent.change(await screen.findByLabelText('Customer mobile'), { target: { value: '9812345678' } });
    expect(await screen.findByRole('heading', { name: 'Silk Saree' })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Product search or barcode'), { target: { value: 'kurti' } });
    expect(await screen.findByRole('heading', { name: 'Cotton Kurti' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Silk Saree' })).not.toBeInTheDocument();
  });
  it('adds individual catalogue products without a bulk select-all control', async () => {
    mount(<Pos />);
    fireEvent.change(await screen.findByLabelText('Customer name'), { target: { value: 'Walk-in Customer' } });
    fireEvent.change(await screen.findByLabelText('Customer mobile'), { target: { value: '9812345678' } });
    const search = await screen.findByLabelText('Product search or barcode');
    fireEvent.change(search, { target: { value: 'a' } });
    const saree = await screen.findByRole('heading', { name: 'Silk Saree' });
    const kurti = await screen.findByRole('heading', { name: 'Cotton Kurti' });
    const sareeCard = saree.closest('article');
    const kurtiCard = kurti.closest('article');
    if (!sareeCard || !kurtiCard) throw new Error('Expected catalogue product cards were not rendered');
    fireEvent.click(within(sareeCard).getByRole('button', { name: '+ Add' }));
    fireEvent.click(within(kurtiCard).getByRole('button', { name: '+ Add' }));
    expect(screen.getByLabelText('quantity line 1')).toHaveValue(1);
    expect(screen.getByLabelText('quantity line 2')).toHaveValue(1);
    expect(screen.queryByText(/Select all visible/i)).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });
  it('submits keyboard-wedge scans when the scanner sends Enter', async () => {
    mount(<Pos />);
    fireEvent.change(await screen.findByLabelText('Customer name'), { target: { value: 'Walk-in Customer' } });
    fireEvent.change(await screen.findByLabelText('Customer mobile'), { target: { value: '9812345678' } });
    const barcode = await screen.findByLabelText('Product search or barcode');
    fireEvent.change(barcode, { target: { value: 'AL-001' } });
    fireEvent.keyDown(barcode, { key: 'Enter' });
    expect(await screen.findByLabelText('quantity line 1')).toHaveValue(1);
    expect(barcode).toHaveValue('');
    expect(confirm).not.toHaveBeenCalled();
  });
  it('submits keyboard-wedge scans when the scanner sends Tab', async () => {
    mount(<Pos />);
    fireEvent.change(await screen.findByLabelText('Customer name'), { target: { value: 'Walk-in Customer' } });
    fireEvent.change(await screen.findByLabelText('Customer mobile'), { target: { value: '9812345678' } });
    const barcode = await screen.findByLabelText('Product search or barcode');
    fireEvent.change(barcode, { target: { value: 'AL-001' } });
    fireEvent.keyDown(barcode, { key: 'Tab' });
    expect(await screen.findByLabelText('quantity line 1')).toHaveValue(1);
    expect(barcode).toHaveValue('');
    expect(confirm).not.toHaveBeenCalled();
  });
  it('stops barcode scans at available branch stock', async () => {
    mount(<Pos />);
    fireEvent.change(await screen.findByLabelText('Customer name'), { target: { value: 'Walk-in Customer' } });
    fireEvent.change(await screen.findByLabelText('Customer mobile'), { target: { value: '9812345678' } });
    const barcode = await screen.findByLabelText('Product search or barcode');
    for (let i = 0; i < 4; i++) {
      fireEvent.change(barcode, { target: { value: 'AL-001' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add scanned item' }));
    }
    expect(screen.getByLabelText('quantity line 1')).toHaveValue(3);
    expect(screen.getByText(/No additional stock available for Silk Saree/)).toBeInTheDocument();
    expect(barcode).toHaveValue('');
    expect(confirm).not.toHaveBeenCalled();
  });
  it('adds repeated barcode entries to one cart line and retains its exact checkout total', async () => {
    mount(<Pos />);
    fireEvent.change(await screen.findByLabelText('Customer name'), { target: { value: 'Walk-in Customer' } }); fireEvent.change(await screen.findByLabelText('Customer mobile'), { target: { value: '9812345678' } });
    const barcode = await screen.findByLabelText('Product search or barcode');
    for (let i=0;i<2;i++) {
      if (i === 1) fireEvent.click(screen.getByRole('button', { name: /Products/ }));
      const currentBarcode = i === 0 ? barcode : await screen.findByLabelText('Product search or barcode');
      fireEvent.change(currentBarcode, { target: { value: 'AL-001' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add scanned item' }));
    }
    expect(screen.getByLabelText('quantity line 1')).toHaveValue(2);
    expect(screen.queryByLabelText('quantity line 2')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Product search or barcode')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to checkout' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Preview' })[0]);
    const receipt = screen.getByRole('article', { name: 'Receipt preview' });
    expect(within(receipt).getAllByText('Rs. 3,000.00').length).toBeGreaterThan(0);
    expect(confirm).not.toHaveBeenCalled();
  });
  it('leaves the cart unchanged for an unknown barcode and adjusts quantity with touch controls', async () => {
    mount(<Pos />);
    fireEvent.change(await screen.findByLabelText('Customer name'), { target: { value: 'Walk-in Customer' } }); fireEvent.change(await screen.findByLabelText('Customer mobile'), { target: { value: '9812345678' } });
    const barcode = await screen.findByLabelText('Product search or barcode');
    fireEvent.change(barcode, { target: { value: 'UNKNOWN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add scanned item' }));
    expect(screen.queryByLabelText('quantity line 1')).not.toBeInTheDocument();
    await addCatalogSaree();
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity line 1' }));
    expect(screen.getByLabelText('quantity line 1')).toHaveValue(2);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity line 1' }));
    expect(screen.getByLabelText('quantity line 1')).toHaveValue(1);
  });
  it('is a standalone sale screen with optional protected local POS drafts', async () => {
    mount(<Pos />);
    expect(await screen.findByRole('heading', { name: /Point of sale/ })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Customer name'), { target: { value: 'Walk-in Customer' } }); fireEvent.change(await screen.findByLabelText('Customer mobile'), { target: { value: '9812345678' } });
    expect(await screen.findByLabelText('Product search or barcode')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Camera/ })).toBeInTheDocument();
    expect(screen.getByText('Offline POS / Draft Recovery')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock device' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Offline POS / Draft Recovery'));
    expect(screen.getByRole('button', { name: 'Unlock device' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Device passphrase')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('href', '/dashboard');
    noOpenPeriodLabel();
  });
  it('sells through the same confirmation as Sales', async () => {
    mount(<Pos />);
    fireEvent.change(await screen.findByLabelText('Customer name'), { target: { value: 'Walk-in Customer' } }); fireEvent.change(await screen.findByLabelText('Customer mobile'), { target: { value: '9812345678' } });
    fireEvent.change(await screen.findByLabelText('Product search or barcode'), { target: { value: 'AL-001' } });
    fireEvent.keyDown(screen.getByLabelText('Product search or barcode'), { key: 'Enter' });
    expect(screen.getByRole('button', { name: /2 Products/ })).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to checkout' }));
    fireEvent.click(screen.getByRole('button', { name: /^Cash$/ })); payFullTestBalance();
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
    expect(screen.getByLabelText('Filter closing report by staff')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter closing report by branch')).toBeInTheDocument();
    expect(screen.getByText('No counter sessions opened on this date.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Daily cash closing totals' })).not.toBeInTheDocument();
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
