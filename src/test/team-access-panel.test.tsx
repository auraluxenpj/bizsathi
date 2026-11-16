import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { BUSINESS, BRANCH, MANAGER, createInvite } = vi.hoisted(() => ({
  BUSINESS: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  BRANCH: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  MANAGER: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  createInvite: vi.fn(async (_: unknown) => ({
  invitationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  token: 'a'.repeat(64),
  path: '/join#token=' + 'a'.repeat(64),
  expiresAt: '2026-11-23T00:00:00.000Z',
  })),
}));

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock('@/lib/team-access.functions', () => ({
  listTeamInvitations: async () => ({ invitations: [], members: [] }),
  listBranchDelegations: async () => ({ grants: [{
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    branch_id: BRANCH,
    manager_user_id: MANAGER,
    allowed_role_codes: ['staff'],
    max_invite_uses: 3,
    max_invite_days: 2,
  }] }),
  listAccessAudit: async () => ({ entries: [] }),
  createTeamInvitation: createInvite,
  grantBranchDelegation: vi.fn(),
  revokeBranchDelegation: vi.fn(),
  revokeTeamInvitation: vi.fn(),
}));

import { TeamAccessPanel } from '@/components/team-access-panel';

describe('Team Access hierarchy panel', () => {
  beforeEach(() => createInvite.mockClear());

  it('shows the approved seven-role hierarchy and rank ceilings', () => {
    render(<QueryClientProvider client={new QueryClient()}>
      <TeamAccessPanel businessId={BUSINESS} branches={[{ id: BRANCH, name: 'Nepalgunj', code: 'NP', is_active: true }]} members={[]} branchAccess={[]} userId={MANAGER} isAdmin={false} isOwner={false} />
    </QueryClientProvider>);
    for (const role of ['CEO / Platform Owner', 'Administrator / Partner', 'Store Manager', 'Accountant', 'Inventory Manager', 'Cashier / POS', 'Store Team']) {
      expect(screen.getAllByText(role).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/Rank\s*100/)).toBeInTheDocument();
    expect(screen.getByText(/Rank\s*80/)).toBeInTheDocument();
    expect(screen.getAllByText(/Rank\s*60/)).toHaveLength(2);
    expect(screen.getAllByText(/Rank\s*40/)).toHaveLength(3);
  });

  it('limits a branch manager to delegated roles, branch scope and expiry limits', async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamAccessPanel businessId={BUSINESS} branches={[{ id: BRANCH, name: 'Nepalgunj', code: 'NP', is_active: true }]} members={[]} branchAccess={[]} userId={MANAGER} isAdmin={false} isOwner={false} />
    </QueryClientProvider>);

    await screen.findByText('Delegation active for this branch');
    const role = screen.getByLabelText('Role') as HTMLSelectElement;
    expect([...role.options].map((o) => o.value)).toEqual(['staff']);
    expect(screen.getByLabelText('Link expiry (days)')).toHaveValue(2);

    fireEvent.click(screen.getByRole('button', { name: /Create invitation link/ }));
    await waitFor(() => expect(createInvite).toHaveBeenCalledTimes(1));
    expect(createInvite).toHaveBeenCalledWith({ data: expect.objectContaining({
      businessId: BUSINESS,
      branchId: BRANCH,
      role: 'staff',
      expiresInHours: 48,
      maxUses: 1,
    }) });
    expect(await screen.findByText('Share this private invitation link')).toBeInTheDocument();
  });
});
