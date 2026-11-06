import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const BIZ = '55555555-5555-4555-8555-555555555555'; const ME = '66666666-6666-4666-8666-666666666666';
const invite = vi.hoisted(() => vi.fn(async (_: unknown) => ({ token: 'abc' })));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (f: unknown) => f, createServerFn: () => { throw new Error('not used'); } }));
vi.mock('@/lib/business.functions', () => ({
  listBusinesses: async () => [{ id: BIZ, name: 'Auraluxe', role: 'owner' }],
  getBusinessAccess: async () => ({ manager: true, userId: ME, branches: [], members: [], invitations: [], grants: [] }),
  registerBusiness: vi.fn(), createBranch: vi.fn(), updateMember: vi.fn(), setBranchAccess: vi.fn(), revokeInvitation: vi.fn(),
  createInvitation: (a: unknown) => invite(a),
}));
import { BusinessAccess } from '@/components/business-access';

describe('Invite staff role cards', () => {
  it('shows the four real roles as cards and invites with the chosen one', async () => {
    const root = createRootRoute({ component: BusinessAccess });
    const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
    const group = await screen.findByRole('radiogroup', { name: 'Invitation role' });
    for (const name of ['Administrator', 'Accountant', 'Staff', 'Viewer']) expect(group).toHaveTextContent(name);
    fireEvent.change(screen.getByLabelText('Staff email'), { target: { value: 'Sita@Example.com' } });
    fireEvent.click(screen.getByRole('radio', { name: /Accountant/ }));
    fireEvent.click(screen.getByRole('button', { name: /Create invitation/ }));
    await waitFor(() => expect(invite).toHaveBeenCalledTimes(1));
    expect((invite.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({ businessId: BIZ, email: 'sita@example.com', role: 'accountant' });
  });
});
