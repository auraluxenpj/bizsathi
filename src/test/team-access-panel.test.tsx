import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const BIZ = '55555555-5555-4555-8555-555555555555'; const ME = '66666666-6666-4666-8666-666666666666'; const BR = '77777777-7777-4777-8777-777777777777'; const BR2 = '88888888-8888-4888-8888-888888888888';
const state = vi.hoisted(() => ({ admin: true }));
const create = vi.hoisted(() => vi.fn(async (_: unknown) => ({ invitationId: 'i1', token: 'a'.repeat(64), path: `/join#token=${'a'.repeat(64)}`, expiresAt: '2026-12-01T00:00:00Z' })));
const revoke = vi.hoisted(() => vi.fn(async (_: unknown) => ({ ok: true })));
vi.mock('@tanstack/react-start', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tanstack/react-start')>()), useServerFn: (f: unknown) => f }));
vi.mock('@/lib/business.functions', () => ({
  listBusinesses: async () => [{ id: BIZ, name: 'Auraluxe', role: 'owner' }],
  getBusinessAccess: async () => state.admin
    ? { manager: true, userId: ME, branches: [{ id: BR, name: 'Main', is_active: true }, { id: BR2, name: 'Second', is_active: true }], members: [{ user_id: ME, role_code: 'owner', status: 'active', profiles: { full_name: 'Owner' } }, { user_id: 'm1', role_code: 'staff', status: 'active', profiles: { full_name: 'Sita' } }], invitations: [], grants: [] }
    : { manager: false, userId: ME, branches: [{ id: BR, name: 'Main', is_active: true }], members: [], invitations: [], grants: [] },
}));
vi.mock('@/lib/team-access.functions', () => ({
  createTeamInvitation: (a: unknown) => create(a), revokeTeamInvitation: (a: unknown) => revoke(a), grantBranchDelegation: vi.fn(), revokeBranchDelegation: vi.fn(),
  listTeamInvitations: async () => ({ invitations: [{ id: 'inv1', branch_id: BR, role_code: 'staff', job_title: 'sales_person', label: 'Shop floor', invited_by: ME, expires_at: '2026-12-01T00:00:00Z', max_uses: 5, use_count: 2, status: 'partially_used' }, { id: 'inv2', branch_id: BR, role_code: 'viewer', job_title: null, label: null, invited_by: 'other', expires_at: '2026-12-01T00:00:00Z', max_uses: 1, use_count: 1, status: 'accepted' }], members: [{ invitation_id: 'inv1', user_id: 'x', accepted_at: '2026-11-16T00:00:00Z', profiles: { full_name: 'Ram' } }] }),
  listBranchDelegations: async () => ({ grants: state.admin ? [] : [] }),
  listAccessAudit: async () => ({ entries: [{ id: 1, actor: 'Owner', action: 'team_invite.create', created_at: '2026-11-16T00:00:00Z' }] }),
}));
import { TeamAccessSection } from '@/components/team-access-panel';
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TeamAccessSection /></QueryClientProvider>);

describe('Team & Access Management panel', () => {
  it('admin sees all three tabs, invitation status, joined members and creates a link', async () => {
    state.admin = true; mount();
    expect(await screen.findByRole('tab', { name: 'Invitations' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Delegation' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Activity/ })).toBeInTheDocument();
    expect(await screen.findByText(/Partially used · 2\/5 registered/)).toBeInTheDocument();
    expect(screen.getByText(/Joined: Ram/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Revoke/ })).toHaveLength(1); // the accepted one cannot be revoked
    fireEvent.click(screen.getByRole('button', { name: 'Create invitation link' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect((create.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({ businessId: BIZ, branchId: BR, maxUses: 1, expiresInHours: 168 });
    expect(((await screen.findByLabelText('Invitation link')) as HTMLInputElement).value).toContain('/join#token=');
  });
  it('revokes an open invitation', async () => {
    state.admin = true; mount();
    fireEvent.click(await screen.findByRole('button', { name: /Revoke/ }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith({ data: { invitationId: 'inv1' } }));
  });
  it('a person without delegation sees no create form and no admin tabs', async () => {
    state.admin = false; mount();
    expect(await screen.findByText(/cannot create invitation links yet/)).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Delegation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create invitation link' })).toBeNull();
  });
});
