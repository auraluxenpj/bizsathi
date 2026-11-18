import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { BUSINESS, BRANCH, MANAGER, createInvite, setBranchAccess, updateMember } = vi.hoisted(() => ({
  BUSINESS: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  BRANCH: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  MANAGER: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  setBranchAccess: vi.fn(async (_: unknown) => ({ ok: true })),
  updateMember: vi.fn(async (_: unknown) => ({ ok: true })),
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
  getMemberPermissions: async () => ({ userId: MANAGER, denials: [{ user_id: MANAGER, permission: 'settings.edit' }], roleDenials: [] }),
  saveRoleTemplate: vi.fn(),
  resetRoleTemplate: vi.fn(),
  setBranchAccess,
  updateMember,
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

  it('shows employee branch access with position and role scopes separated', () => {
    render(<QueryClientProvider client={new QueryClient()}>
      <TeamAccessPanel businessId={BUSINESS} branches={[{ id: BRANCH, name: 'Nepalgunj', code: 'NP', is_active: true }]} members={[]} branchAccess={[]} userId={MANAGER} isAdmin={true} isBranchManager={true} isOwner={false} />
    </QueryClientProvider>);
    expect(screen.getByText('Employees & branch access')).toBeInTheDocument();
    expect(screen.queryByText('Role hierarchy')).not.toBeInTheDocument();
    expect(screen.getByText(/base access controls which application screens an employee can use/i)).toBeInTheDocument();
  });

  it('keeps invitation and position-permission sections collapsed until selected', () => {
    render(<QueryClientProvider client={new QueryClient()}>
      <TeamAccessPanel businessId={BUSINESS} branches={[{ id: BRANCH, name: 'Nepalgunj', code: 'NP', is_active: true }]} members={[]} branchAccess={[]} userId={MANAGER} isAdmin={false} isOwner={false} />
    </QueryClientProvider>);
    const sectionTitles = ['Invite team member', 'Invitation history & activity', 'Position permissions'];
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
    fireEvent.change(screen.getByLabelText('Change invited position for 9616595288'), { target: { value: 'stock_manager' } });
    expect(changeRole).toHaveBeenCalledWith('ffffffff-ffff-4fff-8fff-ffffffffffff', 'stock_manager');
    fireEvent.click(screen.getByRole('button', { name: 'New link' }));
    expect(reissue).toHaveBeenCalledWith('ffffffff-ffff-4fff-8fff-ffffffffffff', '9616595288');
    fireEvent.click(screen.getByRole('button', { name: /Revoke/ }));
    expect(revoke).toHaveBeenCalledWith('ffffffff-ffff-4fff-8fff-ffffffffffff');
  });


  it('lets an Administrator choose Branch Manager as the employee position', async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamAccessPanel businessId={BUSINESS} branches={[{ id: BRANCH, name: 'Nepalgunj', code: 'NP', is_active: true }]} members={[]} branchAccess={[]} userId={MANAGER} isAdmin={true} isOwner={false} />
    </QueryClientProvider>);

    fireEvent.click(screen.getByText('Invite team member'));
    const position = screen.getByRole('combobox', { name: 'HR position' }) as HTMLSelectElement;
    expect([...position.options].map((o) => o.value)).toContain('branch_manager');
    fireEvent.change(position, { target: { value: 'branch_manager' } });
    expect(position).toHaveValue('branch_manager');
  });

  it('limits a branch manager to delegated roles, branch scope and expiry limits', async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamAccessPanel businessId={BUSINESS} branches={[{ id: BRANCH, name: 'Nepalgunj', code: 'NP', is_active: true }]} members={[]} branchAccess={[]} userId={MANAGER} isAdmin={false} isOwner={false} />
    </QueryClientProvider>);

    await screen.findByText('Delegation active for this branch');
    const position = screen.getByRole('combobox', { name: 'HR position' }) as HTMLSelectElement;
    expect([...position.options].map((o) => o.value)).toEqual(['department_manager', 'sales_person', 'stock_manager', 'entry_person']);
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
      deniedPermissions: [],
      expiresInHours: 48,
      maxUses: 1,
    }) });
    expect(await screen.findByText('Share this private invitation link')).toBeInTheDocument();
  });
  it('allows an administrator to grant an employee access to an additional branch', async () => {
    setBranchAccess.mockClear();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamAccessPanel
        businessId={BUSINESS}
        branches={[
          { id: BRANCH, name: 'Nepalgunj', code: 'NP', is_active: true },
          { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', name: 'Lucknow', code: 'LKO', is_active: true },
        ]}
        members={[{ user_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', role_code: 'staff', job_title: 'sales_person', status: 'active', profiles: { full_name: 'Test Employee' } }]}
        branchAccess={[{ user_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', branch_id: BRANCH }]}
        userId={MANAGER}
        isAdmin={true}
        isOwner={false}
      />
    </QueryClientProvider>);
    const checkbox = screen.getByRole('checkbox', { name: /Grant Lucknow access to Test Employee/i });
    fireEvent.click(checkbox);
    await waitFor(() => expect(setBranchAccess).toHaveBeenCalledWith({ data: {
      businessId: BUSINESS,
      userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      branchId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      allowed: true,
    } }));
  });

  it('keeps HR position separate from the base access role', async () => {
    updateMember.mockClear();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamAccessPanel
        businessId={BUSINESS}
        branches={[{ id: BRANCH, name: 'Nepalgunj', code: 'NP', is_active: true }]}
        members={[{ user_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', role_code: 'staff', job_title: 'sales_person', status: 'active', profiles: { full_name: 'Test Employee' } }]}
        branchAccess={[{ user_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', branch_id: BRANCH }]}
        userId={MANAGER}
        isAdmin={true}
        isOwner={false}
      />
    </QueryClientProvider>);
    const position = screen.getByRole('combobox', { name: 'Position for Test Employee' });
    const baseAccess = screen.getByRole('combobox', { name: 'Base access role for Test Employee' });
    fireEvent.change(position, { target: { value: 'stock_manager' } });
    await waitFor(() => expect(updateMember).toHaveBeenCalledWith({ data: {
      businessId: BUSINESS,
      userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      role: 'staff',
      status: 'active',
      jobTitle: 'stock_manager',
    } }));
    expect(baseAccess).toHaveValue('staff');
  });

  it('lets an administrator switch an existing employee to POS-only Staff access', async () => {
    updateMember.mockClear();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeamAccessPanel
        businessId={BUSINESS}
        branches={[{ id: BRANCH, name: 'Nepalgunj', code: 'NP', is_active: true }]}
        members={[{ user_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', role_code: 'accountant', job_title: 'manager', status: 'active', profiles: { full_name: 'Test Employee' } }]}
        branchAccess={[]}
        userId={MANAGER}
        isAdmin={true}
        isOwner={false}
      />
    </QueryClientProvider>);
    const baseAccess = screen.getByRole('combobox', { name: 'Base access role for Test Employee' });
    expect(baseAccess).toHaveValue('accountant');
    fireEvent.change(baseAccess, { target: { value: 'staff' } });
    await waitFor(() => expect(updateMember).toHaveBeenCalledWith({ data: {
      businessId: BUSINESS,
      userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      role: 'staff',
      status: 'active',
    } }));
  });

});
