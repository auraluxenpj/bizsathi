import {validateReportSearch} from '@/lib/report-filters';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter,createRoute,Outlet } from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
Element.prototype.scrollIntoView = () => {};

const ID = { biz: '55555555-5555-4555-8555-555555555555', br: '33333333-3333-4333-8333-333333333333', per: '44444444-4444-4444-8444-444444444444', user: '66666666-6666-4666-8666-666666666666', s1: '11111111-1111-4111-8111-111111111111', p1: '88888888-8888-4888-8888-888888888888', p2: '99999999-9999-4999-8999-999999999999' };
const commerce = {
  userId: ID.user, role: 'owner', counters: [], memberships: [], loyalty: [], periods: [],
  settings: { vat_registered: false, vat_rate: 0, currency: 'NPR' }, business: { name: 'Auraluxe', legal_name: 'Auraluxe', pan_vat_number: '' },
  documents: [{ id: ID.s1, kind: 'sale', status: 'confirmed', total: 1000, document_date: '2026-10-01', created_at: '1', party_id: ID.p1, source_id: null, reference: 'INV-1', branch_id: ID.br }],
  payments: [{ id: 'pay1', document_id: ID.s1, amount: 400, direction: 'in', payment_date: '2026-10-05', created_at: '2', method: 'bank', reference: 'first part' }],
  journals: [{ account_code: 'cash', debit: 400, credit: 0, entry_date: '2026-10-05', branch_id: ID.br }, { account_code: 'bank', debit: 3000, credit: 0, entry_date: '2026-10-05', branch_id: ID.br }, { account_code: 'wallet', debit: 100, credit: 0, entry_date: '2026-10-05', branch_id: ID.br }],
};
vi.mock('@tanstack/react-start', () => ({ useServerFn: (f: unknown) => f, createServerFn: () => { throw new Error('not used'); } }));
vi.mock('@/lib/accounts.functions', () => ({ getAccountBalances: async () => ({ accounts: [], unassigned: { cash: 0, bank: 0, wallet: 0 } }), confirmDocumentTagged: vi.fn(), recordPaymentTagged: vi.fn(), postVoucherTagged: vi.fn(), createAccount: vi.fn(), adjustAccount: vi.fn(), transferBetweenAccounts: vi.fn() }));
vi.mock('@/lib/commerce.functions', () => ({ getCommerce: async () => commerce, saveTradingSettings: vi.fn(), createTradingPeriod: vi.fn(), recordPayment: vi.fn(), confirmDocument: vi.fn(), findCommerceDocument: vi.fn(), recordCounter: vi.fn() }));
vi.mock('@/lib/business.functions', () => ({ getMemberPermissions:async()=>({userId:ID.user,denials:[]}),getBusinessAccess: async () => ({ branches: [{ id: ID.br, name: 'Main', is_active: true }] }), listBusinesses: async () => [{ id: ID.biz, name: 'Auraluxe', role: 'owner' }] }));
vi.mock('@/lib/accounting.functions',()=>({getAccountingReport:async()=>({branches:[{id:ID.br,name:'Main'}]})}));
vi.mock('@/lib/sales-cash-flow.functions',()=>({getPaymentQr:async()=>({url:null}),saveCreditLimit:vi.fn(),savePaymentQr:vi.fn()}));
vi.mock('@/lib/inventory.functions', () => ({ getInventory: async () => ({ movements: [], variants: [], parties: [
  { id: ID.p1, name: 'Ram Traders', phone: '9800000000', kind: 'customer', is_active: true },
  { id: ID.p2, name: 'Sita Supplies', phone: '', kind: 'supplier', is_active: true },
] }) }));
vi.mock('@/lib/inventory-queries', () => ({ businessQuery: { queryKey: ['businesses'], queryFn: async () => [{ id: ID.biz, name: 'Auraluxe', role: 'owner' }] } }));
vi.mock('@/components/trading-settings', () => ({ TradingSettings: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { email: 'v@example.com', user_metadata: { full_name: 'Vikky' } } } }), signOut: vi.fn() } } }));

import { ReportsHub } from '@/components/reports-hub';
import { Transactions } from '@/components/transactions';
import { CashBank } from '@/components/cash-bank';
import { CreditReminder } from '@/components/credit-reminder';
import { Calculators } from '@/components/calculators';
import { MoreMenu } from '@/components/more-menu';
import { AppNavigation } from '@/components/app-navigation';
import { Dashboard } from '@/components/dashboard';

function mount(ui: ReactNode,path='/') {
  const root = createRootRoute({ component: Outlet });
  const layout=createRoute({getParentRoute:()=>root,id:'_authenticated',component:Outlet});
  const child=createRoute({getParentRoute:()=>layout,path,component:()=> <>{ui}</>,validateSearch:validateReportSearch});
  const router = createRouter({ routeTree: root.addChildren([layout.addChildren([child])]), history: createMemoryHistory({ initialEntries: [path] }) });
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
}

describe('Karobar-style screens', () => {
  it('View Reports opens the existing reports', async () => {
    mount(<ReportsHub />,'/reports');
    expect(await screen.findByText('Popular Reports')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sales Report/ })).toHaveAttribute('href', '/accounting?view=sales');
    expect(screen.getByRole('link', { name: /Profit & Loss Report/ })).toHaveAttribute('href', '/accounting?view=profit');
    expect(screen.getByRole('link', { name: /Party Statement/ })).toHaveAttribute('href', '/accounting?view=statement');
    expect(screen.getByRole('link', { name: /All Transactions Report/ })).toHaveAttribute('href', '/transactions');
    expect(screen.getByText('Business Status Report')).toBeInTheDocument();
  });

  it('Transactions lists sales and payments and filters them', async () => {
    mount(<Transactions />,'/transactions');
    expect(await screen.findByText(/Sale · INV-1/)).toBeInTheDocument();
    expect(screen.getByText(/Payment in · first part/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Payment In' }));
    expect(screen.queryByText(/Sale · INV-1/)).not.toBeInTheDocument();
    expect(screen.getByText(/Payment in · first part/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search transactions'), { target: { value: 'zzz' } });
    expect(screen.getByText('No transactions found.')).toBeInTheDocument();
  });

  it('Cash & Bank shows balances from the books', async () => {
    mount(<CashBank />);
    expect(await screen.findByText('Overall Account Balance')).toBeInTheDocument();
    expect(screen.getByText('Rs. 3,500.00')).toBeInTheDocument();
    expect(screen.getByText('Rs. 3,000.00')).toBeInTheDocument();
    expect(screen.getByText('Rs. 400.00')).toBeInTheDocument();
  });

  it('Credit Reminder builds a WhatsApp link for a customer who owes money', async () => {
    mount(<CreditReminder />);
    expect(await screen.findByText('Ram Traders')).toBeInTheDocument();
    expect(screen.getAllByText('Rs. 600.00').length).toBeGreaterThan(0);
    const wa = screen.getByRole('link', { name: /WhatsApp/ });
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/9779800000000\?text=/);
    expect(decodeURIComponent(wa.getAttribute('href')??'')).toContain('Rs. 600.00');
    expect(screen.queryByText('Sita Supplies')).not.toBeInTheDocument();
  });

  it('Calculators work out VAT', async () => {
    mount(<Calculators />);
    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '1000' } });
    expect(screen.getByText('Rs. 1,130.00')).toBeInTheDocument();
    expect(screen.getByText('Rs. 130.00')).toBeInTheDocument();
  });

  it('More menu has the Karobar sections', async () => {
    mount(<MoreMenu />);
    expect(await screen.findByText('Business Profile')).toBeInTheDocument();
    for (const t of ['Credit Reminder', 'Manage Staff', 'Cash & Bank Accounts', 'View Reports', 'Account Settings', 'Utilities', 'Calculators', 'Sign out']) expect(screen.getByText(t)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cash & Bank Accounts/ })).toHaveAttribute('href', '/cash-bank');
    expect(await screen.findByText('Security Findings')).toBeInTheDocument();
  });

  it('mobile tabs are Home, Transactions, Parties, Inventory, More', async () => {
    mount(<AppNavigation pathname="/dashboard"><p>body</p></AppNavigation>);
    const tabs = await screen.findByRole('navigation', { name: 'Mobile navigation' });
    const names = within(tabs).getAllByRole('link').map(a => a.textContent);
    expect(names).toEqual(['Home', 'Transactions', 'Parties', 'Inventory', 'More']);
    expect(within(tabs).getByRole('link', { name: 'More' })).toHaveAttribute('href', '/more');
  });

  it('dashboard shows Explore App and Shortcuts', async () => {
    mount(<Dashboard />);
    expect(await screen.findByText('Explore App')).toBeInTheDocument();
    for (const t of ['Quick Entry', 'View Reports', 'Credit Reminder', 'Add Party', 'Sales Invoice', 'Payment In', 'Payment Out']) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
  });
});
