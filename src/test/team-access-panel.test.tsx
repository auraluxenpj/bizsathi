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
vi.mock('@/lib/business.functions', () => ({
  getRoleTemplates: async () => ({ templates: { sales_person: { denied: [], customized: false } } }),
  saveRoleTemplate: vi.fn(),
  resetRoleTemplate: vi.fn(),
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

  it('shows the approved role hierarchy and rank ceilings', () => {
    render(<QueryClientProvider client={new QueryClient()}>
      <TeamAccessPanel businessId={BUSINESS} branches={[{ id: BRANCH, name: 'Nepalgunj', code: 'NP', is_active: true }]} members={[]} branchAccess={[]} userId={MANAGER} isAdmin={false} isOwner={false} />
    </QueryClientProvider>);
    for (const role of ['Master Owner', 'Business Owner', 'Administrator', 'Branch Manager', 'Accountant', 'Inventory Manager', 'Cashier / POS', 'Store Team', 'Viewer']) {
      expect(screen.getAllByText(role).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText(/Rank\s*100/)).toHaveLength(2);
    expect(screen.getByText(/Rank\s*80/)).toBeInTheDocument();
    expect(screen.getAllByText(/Rank\s*60/)).toHaveLength(1);\n    expect(screen.getAllByText(/Rank\s*50/)).toHaveLength(1);
    expect(screen.getAllByText(/Rank\s*40/)).toHaveLength(3);\n    expect(screen.getAllByText(/Rank\s*20/)).toHaveLength(1);
  });

  it('keeps all five major Team Access areas collapsed until selected', () => {
    render(<QueryClientProvider client={new QueryClient()}>
      <TeamAccessPanel businessId={BUSINESS} branches={[{ id: BRANCH, name: 'Nepalgunj', code: 'NP', is_active: true }]} members={[]} branchAccess={[]} userId={MANAGER} isAdmin={false} isOwner={false} />
    </QueryClientProvider>);
    const sectionTitles = ['Role hierarchy', 'Branch delegation', 'Invite team member', 'Invitation history & activity', 'Role permissions'];
    for (const title of sectionTitles) {
      const summaries = screen.getAllByText(title).map((element) => element.closest('summary')).filter(Boolean);
      expect(summaries).toHaveLength(1);
      const accordion = summaries[0]?.closest('details');
      expect(accordion).not.toBeNull();
      expect(accordion).not.toHaveAttribute('open');
      expect(accordion).toHaveAttribute('name', 'team-access-sections');
    }
  });

  it('keeps earlier invitation history and management actions inside Team Access', async () => {
    const reissue = vi.fn();
    const changeRole = vi.fn();
    const revoke = vi.fn();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamAccessPanel
        businessId={BUSINESS}
        branches={[{ id: BRANCH, name: 'Nepalgunj', code: 'NP', is_active: true }]}
        members={[]}
        branchAccess={[]}
        userId={MANAGER}
        isAdmin={false}
        isOwner={false}
        legacyTitles={['sales_person', 'stock_manager']}
        legacyInvitations={[{
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          email: null,
          mobile: '9616595288',
          invitee_name: null,
          job_title: 'sales_person',
          role_code: 'staff',
          expires_at: '2026-11-22T00:00:00.000Z',
          accepted_at: null,
          revoked_at: null,
          created_at: '2026-11-16T00:00:00.000Z',
        }]}
        onLegacyReissue={reissue}
        onLegacyChangeRole={changeRole}
        onLegacyRevoke={revoke}
      />
    </QueryClientProvider>);

    expect(await screen.findByText('Earlier invitations')).toBeInTheDocument();
    expect(screen.getByText(/Sales Person · Pending/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Change invited role for 9616595288'), { target: { value: 'stock_manager' } });
    expect(changeRole).toHaveBeenCalledWith('ffffffff-ffff-4fff-8fff-ffffffffffff', 'stock_manager');
    fireEvent.click(screen.getByRole('button', { name: 'New link' }));
    expect(reissue).toHaveBeenCalledWith('ffffffff-ffff-4fff-8fff-ffffffffffff', '9616595288');
    fireEvent.click(screen.getByRole('button', { name: /Revoke/ }));
    expect(revoke).toHaveBeenCalledWith('ffffffff-ffff-4fff-8fff-ffffffffffff');
  });


  it('lets an Administrator invite a distinct Branch Manager', async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamAccessPanel businessId={BUSINESS} branches={[{ id: BRANCH, name: 'Nepalgunj', code: 'NP', is_active: true }]} members={[]} branchAccess={[]} userId={MANAGER} isAdmin={true} isOwner={false} />
    </QueryClientProvider>);

    fireEvent.click(screen.getByText('Invite team member'));
    const role = screen.getByRole('combobox', { name: 'Role' }) as HTMLSelectElement;
    expect([...role.options].map((o) => o.value)).toContain('branch_manager');
    fireEvent.change(role, { target: { value: 'branch_manager' } });
    expect(screen.getByRole('combobox', { name: 'Position' })).toHaveValue('branch_manager');
    expect(screen.getAllByRole('option', { name: 'Branch Manager' }).length).toBeGreaterThan(0);
  });

  it('limits a branch manager to delegated roles, branch scope and expiry limits', async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamAccessPanel businessId={BUSINESS} branches={[{ id: BRANCH, name: 'Nepalgunj', code: 'NP', is_active: true }]} members={[]} branchAccess={[]} userId={MANAGER} isAdmin={false} isOwner={false} />
    </QueryClientProvider>);

    await screen.findByText('Delegation active for this branch');
    const role = screen.getByRole('combobox', { name: 'Role' }) as HTMLSelectElement;
    expect([...role.options].map((o) => o.value)).toEqual(['staff']);
    expect(screen.getByLabelText('Link expiry (days)')).toHaveValue(2);

    fireEvent.change(screen.getByLabelText('Invitee email address'), { target: { value: 'staff@example.com' } });
    fireEvent.change(screen.getByLabelText('Invitee Nepal mobile number'), { target: { value: '9812345678' } });
    fireEvent.click(screen.getByRole('button', { name: /Create invitation link/ }));
    await waitFor(() => expect(createInvite).toHaveBeenCalledTimes(1));
    expect(createInvite).toHaveBeenCalledWith({ data: expect.objectContaining({
      businessId: BUSINESS,
      branchId: BRANCH,
      role: 'staff',
      inviteeEmail: 'staff@example.com',
      inviteeMobile: '9812345678',
      expiresInHours: 48,
      maxUses: 1,
    }) });
    expect(await screen.findByText('Share this private invitation link')).toBeInTheDocument();
  });
});
