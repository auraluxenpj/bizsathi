import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const BIZ = '55555555-5555-4555-8555-555555555555'; const ME = '66666666-6666-4666-8666-666666666666'; const BRANCH = '77777777-7777-4777-8777-777777777777';
const invite = vi.hoisted(() => vi.fn(async (_: unknown) => ({ path: '/join#token=' + 'a'.repeat(64) })));
vi.mock('@tanstack/react-start', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tanstack/react-start')>()), useServerFn: (f: unknown) => f }));
vi.mock('@/lib/business.functions', () => ({
  getMemberPermissions: async () => ({ userId: ME, denials: [], roleDenials: [] }),
  listBusinesses: async () => [{ id: BIZ, name: 'Auraluxe', role: 'owner' }],
  getBusinessAccess: async () => ({ manager: true, userId: ME, branches: [{ id: BRANCH, name: 'Nepalgunj', code: '001', is_active: true }], members: [], invitations: [], grants: [] }),
  registerBusiness: vi.fn(), createBranch: vi.fn(), updateMember: vi.fn(), setBranchAccess: vi.fn(), revokeInvitation: vi.fn(),
  reissueInvitation: vi.fn(), changeInvitationRole: vi.fn(), removeMember: vi.fn(), getRoleTemplates: async () => ({ templates: {} }), resetRoleTemplate: vi.fn(), saveRoleTemplate: vi.fn(),
}));
vi.mock('@/lib/team-access.functions', () => ({
  listTeamInvitations: async () => ({ invitations: [], members: [] }),
  listBranchDelegations: async () => ({ grants: [] }),
  listAccessAudit: async () => ({ entries: [] }),
  createTeamInvitation: (a: unknown) => invite(a),
  grantBranchDelegation: vi.fn(),
  revokeBranchDelegation: vi.fn(),
  revokeTeamInvitation: vi.fn(),
}));
import { BusinessAccess } from '@/components/business-access';

describe('Team Access invitations', () => {
  it('creates a branch-locked invitation using the selected position', async () => {
    const root = createRootRoute({ component: BusinessAccess });
    const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);

    await screen.findByText('Invite team member');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'HR position' }).querySelectorAll('option').length).toBeGreaterThan(0));
    fireEvent.change(screen.getByRole('combobox', { name: 'Position' }), { target: { value: 'accountant' } });
    fireEvent.change(screen.getByLabelText('Invitee email address'), { target: { value: 'staff@example.com' } });
    fireEvent.change(screen.getByLabelText('Invitee Nepal mobile number'), { target: { value: '9800000000' } });
    fireEvent.click(screen.getByRole('button', { name: /Create invitation link/ }));

    await waitFor(() => expect(invite).toHaveBeenCalledTimes(1));
    expect((invite.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({
      businessId: BIZ,
      branchId: BRANCH,
      role: 'staff',
      jobTitle: 'accountant',
      inviteeEmail: 'staff@example.com',
      inviteeMobile: '9800000000',
      maxUses: 1,
    });
  });
});
