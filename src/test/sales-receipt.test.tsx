import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const ID = { biz: '55555555-5555-4555-8555-555555555555', br: '33333333-3333-4333-8333-333333333333', per: '44444444-4444-4444-8444-444444444444', user: '66666666-6666-4666-8666-666666666666', v1: '77777777-7777-4777-8777-777777777777', p1: '88888888-8888-4888-8888-888888888888', d1: '99999999-9999-4999-8999-999999999999' };
const commerce = {
  userId: ID.user, role: 'owner', counters: [], journals: [], memberships: [], loyalty: [],
  settings: { vat_registered: false, vat_rate: 0, currency: 'NPR' }, business: { name: 'Auraluxe', legal_name: 'Auraluxe Private Limited', pan_vat_number: '601234567' },
  periods: [{ id: ID.per, name: 'FY', status: 'open', start_date: '2020-01-01', end_date: '2099-12-31' }],
  documents: [{ id: ID.d1, kind: 'sale', status: 'confirmed', reference: 'INV-1001', document_date: '2026-11-06', created_at: '2026-11-06T05:00:00Z', branch_id: ID.br, period_id: ID.per, party_id: ID.p1, source_id: null, subtotal: 3000, tax: 0, total: 3000, mobile: '9812345678', lines: [{ variantId: ID.v1, name: 'Silk Saree', sku: 'AL-001', quantity: 2, price: 1500, discount: 0, taxRate: 0, total: 3000 }] }],
  payments: [{ id: 'pay1', document_id: ID.d1, amount: 1000, direction: 'in', payment_date: '2026-11-06', created_at: '2026-11-06T05:10:00Z', method: 'cash', reference: 'part' }],
};
vi.mock('@tanstack/react-start', () => ({ useServerFn: (f: unknown) => f, createServerFn: () => { throw new Error('not used'); } }));
vi.mock('@/lib/commerce.functions', () => ({ getCommerce: async () => commerce, confirmDocument: vi.fn(), findCommerceDocument: vi.fn(), createTradingPeriod: vi.fn(), recordCounter: vi.fn(), recordPayment: vi.fn(), saveTradingSettings: vi.fn() }));
vi.mock('@/lib/business.functions', () => ({ getBusinessAccess: async () => ({ branches: [{ id: ID.br, name: 'Main', is_active: true }] }), listBusinesses: async () => [{ id: ID.biz, name: 'Auraluxe', role: 'owner' }] }));
vi.mock('@/lib/inventory.functions', () => ({ getInventory: async () => ({ movements: [], variants: [], parties: [{ id: ID.p1, name: 'Ram Traders', phone: '9812345678', kind: 'customer', is_active: true }] }) }));
vi.mock('@/lib/inventory-queries', () => ({ businessQuery: { queryKey: ['businesses'], queryFn: async () => [{ id: ID.biz, name: 'Auraluxe', role: 'owner' }] } }));
vi.mock('@/components/trading-settings', () => ({ TradingSettings: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));
import { TradingDocuments } from '@/components/trading-documents';

describe('Sales receipt view', () => {
  it('opens a confirmed sale as a printable invoice with WhatsApp to the customer', async () => {
    const root = createRootRoute({ component: () => <TradingDocuments mode="sale" /> });
    const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/sales'] }) });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
    fireEvent.click(await screen.findByText(/INV-1001/));
    const sheet = await screen.findByLabelText('Invoice receipt');
    for (const t of ['Auraluxe Private Limited', 'Ram Traders', 'Silk Saree', 'Rs. 3,000.00', 'Rs. 2,000.00']) expect(sheet).toHaveTextContent(t);
    expect(screen.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/9779812345678/);
    fireEvent.click(screen.getByRole('button', { name: '80mm' }));
    expect(within(screen.getByLabelText('Invoice receipt')).getByText(/Thank you! Visit again/)).toBeInTheDocument();
    expect(screen.getByLabelText('Invoice receipt')).toHaveAttribute('data-layout', 'thermal');
  });
});
