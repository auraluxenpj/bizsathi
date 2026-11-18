import { useEffect, useState } from 'react';
type RoleCode = 'accountant' | 'admin' | 'branch_manager' | 'staff' | 'viewer';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { GitBranch, ShieldCheck, Users, UserPlus, Ban, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RolePermissions } from '@/components/role-permissions';
import { jobTitleCodes, jobTitles, type JobTitle } from '@/lib/job-titles';
import { setBranchAccess, updateMember } from '@/lib/business.functions';
import { normalizeVerifiedNepalMobile } from '@/lib/login-identifier';
import {
  createTeamInvitation,
  grantBranchDelegation,
  listAccessAudit,
  listBranchDelegations,
  listTeamInvitations,
  revokeBranchDelegation,
  revokeTeamInvitation,
} from '@/lib/team-access.functions';

type Branch = { id: string; name: string; code: string; is_active: boolean };
type Member = { user_id: string; role_code: string; job_title: string | null; status: string; profiles?: { full_name: string | null } | null };
type BranchAccess = { user_id: string; branch_id: string };
type MemberRole = { userId: string; roleId: string; roleCode: string; roleName: string; authorityRank: number; isDefault: boolean; assignedAt: string };
type LegacyInvitation = { id: string; email: string | null; mobile: string | null; invitee_name: string | null; job_title: string | null; role_code: string; expires_at: string; accepted_at: string | null; revoked_at: string | null; created_at: string };


const titleByRole: Record<string, JobTitle[]> = {
  admin: ['partner'],
  branch_manager: ['branch_manager'],
  accountant: ['accountant'],
  staff: ['department_manager', 'sales_person', 'stock_manager', 'entry_person'],
  viewer: [],
};
const titleLabel: Record<JobTitle, string> = {
  partner: 'Administrator / Partner',
  manager: 'Manager (legacy)',
  branch_manager: 'Branch Manager',
  accountant: 'Accountant',
  department_manager: 'Department Manager',
  sales_person: 'Cashier / POS',
  stock_manager: 'Inventory Manager',
  entry_person: 'Store Team',
};
const roleRank: Record<string, number> = { owner: 100, admin: 80, accountant: 60, branch_manager: 50, staff: 40, viewer: 20 };

export function TeamAccessPanel({
  businessId, branches, members, branchAccess, memberRoles = [], userId, isAdmin, isOwner, isBranchManager = false,
  legacyInvitations = [], legacyTitles = [], onLegacyReissue, onLegacyChangeRole, onLegacyRevoke,
  legacyActionsPending = false, legacyInviteLink = '', viewMode = 'all',
}: {
  businessId: string;
  branches: Branch[];
  members: Member[];
  branchAccess: BranchAccess[];
  memberRoles?: MemberRole[];
  userId: string;
  isAdmin: boolean;
  isOwner: boolean;
  isBranchManager?: boolean;
  legacyInvitations?: LegacyInvitation[];
  legacyTitles?: JobTitle[];
  onLegacyReissue?: (invitationId: string, mobile: string) => void;
  onLegacyChangeRole?: (invitationId: string, jobTitle: JobTitle) => void;
  onLegacyRevoke?: (invitationId: string) => void;
  legacyActionsPending?: boolean;
  legacyInviteLink?: string;
  viewMode?: 'employees' | 'positions' | 'all';
}) {
  const client = useQueryClient();
  const listInvitesFn = useServerFn(listTeamInvitations);
  const listDelegationsFn = useServerFn(listBranchDelegations);
  const listAuditFn = useServerFn(listAccessAudit);
  const createInviteFn = useServerFn(createTeamInvitation);
  const grantFn = useServerFn(grantBranchDelegation);
  const revokeGrantFn = useServerFn(revokeBranchDelegation);
  const revokeInviteFn = useServerFn(revokeTeamInvitation);
  const setBranchAccessFn = useServerFn(setBranchAccess);
  const updateMemberFn = useServerFn(updateMember);

  const invitations = useQuery({
    queryKey: ['team-invitations', businessId],
    queryFn: () => listInvitesFn({ data: { businessId } }),
    enabled: Boolean(businessId),
  });
  const delegations = useQuery({
    queryKey: ['team-delegations', businessId],
    queryFn: () => listDelegationsFn({ data: { businessId } }),
    enabled: Boolean(businessId),
  });
  const audit = useQuery({
    queryKey: ['team-access-audit', businessId],
    queryFn: () => listAuditFn({ data: { businessId } }),
    enabled: Boolean(businessId),
  });

  const [branchId, setBranchId] = useState('');
  const selectedBranchId = branches.some((b) => b.id === branchId) ? branchId : branches[0]?.id ?? '';
  const [managerUserId, setManagerUserId] = useState('');
  const [delegatedRoles, setDelegatedRoles] = useState<string[]>(['staff', 'viewer']);
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [inviteeMobile, setInviteeMobile] = useState('');
  const [expiryDays, setExpiryDays] = useState(7);
  const [inviteRole, setInviteRole] = useState<RoleCode>('staff');
  const [jobTitle, setJobTitle] = useState<JobTitle | ''>('sales_person');
  const [label, setLabel] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [message, setMessage] = useState('');

  const currentGrant = delegations.data?.grants.find((g: { branch_id: string; manager_user_id: string }) =>
    g.branch_id === selectedBranchId && g.manager_user_id === userId);
  const currentGrantRoles = (currentGrant?.allowed_role_codes ?? []) as string[];
  const allowedInviteRoles: RoleCode[] = isBranchManager
    ? currentGrantRoles.filter((r) => r === 'staff' || r === 'viewer') as RoleCode[]
    : isAdmin
      ? (isOwner ? ['admin', 'branch_manager', 'accountant', 'staff', 'viewer'] : ['branch_manager', 'accountant', 'staff', 'viewer'])
      : currentGrantRoles.filter((r) => (roleRank[r] ?? 100) < 60) as RoleCode[];
  const maxAllowedDays = currentGrant?.max_invite_days ?? 30;
  const effectiveExpiryDays = Math.min(expiryDays, maxAllowedDays);
  const inviteMobileValid = Boolean(normalizeVerifiedNepalMobile(inviteeMobile));
  const availableTitles: JobTitle[] = isBranchManager
    ? (inviteRole === 'staff' ? ['department_manager','sales_person','stock_manager','entry_person'] : [])
    : isAdmin
      ? jobTitleCodes.filter((title) => isOwner || title !== 'partner')
      : (titleByRole[inviteRole] ?? []);
  const allowedInviteRolesKey = allowedInviteRoles.join('|');
  useEffect(() => {
    if (!allowedInviteRoles.includes(inviteRole)) setInviteRole(allowedInviteRoles[0] ?? 'staff');
  }, [allowedInviteRolesKey, inviteRole]);
  const availableTitlesKey = availableTitles.join('|');
  useEffect(() => {
    if (!availableTitles.length) setJobTitle('');
    else if (!jobTitle || !availableTitles.includes(jobTitle)) setJobTitle(availableTitles[0] ?? '');
  }, [availableTitlesKey, jobTitle]);
  const eligibleManagers = members.filter((m) =>
    m.status === 'active' && memberRoles.some((r) => r.userId === m.user_id && ['position_branch_manager','legacy_branch_manager'].includes(r.roleCode)) &&
    branchAccess.some((g) => g.user_id === m.user_id && g.branch_id === selectedBranchId));
  const selectedManager = eligibleManagers.find((m) => m.user_id === managerUserId);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['team-invitations', businessId] });
    void client.invalidateQueries({ queryKey: ['team-delegations', businessId] });
    void client.invalidateQueries({ queryKey: ['team-access-audit', businessId] });
  };

  const createInvite = useMutation({
    mutationFn: () => createInviteFn({ data: {
      businessId, branchId: selectedBranchId, role: inviteRole, inviteeEmail, inviteeMobile,
      jobTitle: jobTitle && availableTitles.includes(jobTitle) ? jobTitle : undefined,
      deniedPermissions: [],
      expiresInHours: effectiveExpiryDays * 24, maxUses: 1, label: label || undefined,
    } }),
    onSuccess: (result) => {
      setInviteLink(`${window.location.origin}${result.path}`);
      setMessage('Invitation link created. Share it with the invited team member.');
      setLabel('');
      setInviteeEmail('');
      setInviteeMobile('');
      refresh();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Invitation could not be created.'),
  });

  const grant = useMutation({
    mutationFn: () => grantFn({ data: {
      businessId, branchId: selectedBranchId, managerUserId,
      roles: delegatedRoles as ('staff' | 'viewer')[],
      maxUses: 25, maxDays: 14,
    } }),
    onSuccess: () => { setMessage('Branch delegation updated.'); refresh(); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Delegation could not be saved.'),
  });
  const revokeGrant = useMutation({
    mutationFn: (grantId: string) => revokeGrantFn({ data: { grantId } }),
    onSuccess: () => { setMessage('Delegation revoked.'); refresh(); },
    onError: () => setMessage('Delegation could not be revoked.'),
  });
  const branchAccessMutation = useMutation({
    mutationFn: (v: { userId: string; branchId: string; allowed: boolean }) => setBranchAccessFn({ data: { businessId, userId: v.userId, branchId: v.branchId, allowed: v.allowed } }),
    onSuccess: () => { setMessage('Employee branch access updated.'); void client.invalidateQueries({ queryKey: ['business-access', businessId] }); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Branch access could not be changed.'),
  });
  const positionMutation = useMutation({
    mutationFn: (v: { userId: string; jobTitle: JobTitle; status: string }) => updateMemberFn({ data: {
      businessId, userId: v.userId, role: (members.find((m) => m.user_id === v.userId)?.role_code as RoleCode | undefined) ?? 'staff', status: v.status === 'suspended' ? 'suspended' : 'active', jobTitle: v.jobTitle,
    } }),
    onSuccess: () => { setMessage('Employee position updated.'); void client.invalidateQueries({ queryKey: ['business-access', businessId] }); void client.invalidateQueries({ queryKey: ['permissions', businessId] }); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Employee position could not be changed.'),
  });
  const baseRoleMutation = useMutation({
    mutationFn: (v: { userId: string; role: 'admin' | 'accountant' | 'staff' | 'viewer' }) => {
      const member = members.find((m) => m.user_id === v.userId);
      return updateMemberFn({ data: { businessId, userId: v.userId, role: v.role, status: member?.status === 'suspended' ? 'suspended' : 'active' } });
    },
    onSuccess: () => { setMessage('Employee base access role updated.'); void client.invalidateQueries({ queryKey: ['business-access', businessId] }); void client.invalidateQueries({ queryKey: ['permissions', businessId] }); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Employee base access could not be changed.'),
  });
  const revokeInvite = useMutation({
    mutationFn: (invitationId: string) => revokeInviteFn({ data: { invitationId } }),
    onSuccess: () => { setMessage('Invitation revoked.'); setInviteLink(''); refresh(); },
    onError: () => setMessage('Invitation could not be revoked.'),
  });

  return (
    <section className="space-y-7 border-b py-7" aria-labelledby="team-access-heading">
      {viewMode !== 'positions' && <>
      <section className="rounded-xl border p-4 md:p-5">
        <div className="mb-3 flex items-center gap-2"><Users className="size-4 text-primary" /><h3 className="font-semibold">Employees & branch access</h3></div>
        <p className="mb-4 text-sm text-muted-foreground">Base access controls which application screens an employee can use; Staff · POS only is the restricted cashier role. HR position is a separate job designation. Branch membership controls where the employee can work.</p>
        {members.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="py-2 pr-4 font-medium">Employee</th><th className="py-2 pr-4 font-medium">Base access</th><th className="py-2 pr-4 font-medium">HR position</th>{branches.map((b) => <th key={b.id} className="px-3 py-2 text-center font-medium">{b.name}</th>)}</tr></thead><tbody className="divide-y">{members.map((m) => {
          const assignedAuthority = memberRoles.filter((r) => r.userId === m.user_id).reduce((rank, r) => Math.max(rank, r.authorityRank), 0);
          const effectiveAuthority = Math.max(roleRank[m.role_code] ?? 0, assignedAuthority);
          const protectedMember = m.user_id === userId || effectiveAuthority >= (isOwner ? 100 : 80);
          const employeeName = m.profiles?.full_name || m.user_id.slice(0, 8);
          const permittedPositions = jobTitleCodes.filter((title) => isOwner || title !== 'partner');
          return <tr key={m.user_id}>
            <td className="py-3 pr-4 font-medium">{employeeName}</td>
            <td className="py-3 pr-4">{isAdmin && !protectedMember ? <select aria-label={`Base access role for ${employeeName}`} className="h-9 max-w-48 rounded-md border bg-background px-2" value={m.role_code} disabled={baseRoleMutation.isPending} onChange={(e) => baseRoleMutation.mutate({ userId: m.user_id, role: e.target.value as 'admin' | 'accountant' | 'staff' | 'viewer' })}>
              {isOwner && <option value="admin">Administrator</option>}
              <option value="accountant">Accountant</option>
              <option value="staff">Staff · POS only</option>
              <option value="viewer">Viewer</option>
              {m.role_code === 'branch_manager' && <option value="branch_manager" disabled>Branch Manager</option>}
            </select> : ({staff:'Staff · POS only',viewer:'Viewer',accountant:'Accountant',branch_manager:'Branch Manager',admin:'Administrator',owner:'Owner'} as Record<string,string>)[m.role_code] ?? m.role_code}</td>
            <td className="py-3 pr-4">{isAdmin && !protectedMember ? <select aria-label={`Position for ${employeeName}`} className="h-9 max-w-48 rounded-md border bg-background px-2" value={m.job_title ?? ''} disabled={positionMutation.isPending} onChange={(e) => positionMutation.mutate({ userId: m.user_id, jobTitle: e.target.value as JobTitle, status: m.status })}>
              <option value="" disabled>Select position</option>
              {permittedPositions.map((title) => <option key={title} value={title}>{jobTitles[title].label}</option>)}
            </select> : (jobTitles[(m.job_title ?? '') as JobTitle]?.label ?? 'Position not assigned')}</td>
            {branches.map((b) => {
              const checked = branchAccess.some((x) => x.user_id === m.user_id && x.branch_id === b.id);
              return <td key={b.id} className="px-3 py-3 text-center"><input aria-label={`Grant ${b.name} access to ${employeeName}`} type="checkbox" checked={checked} disabled={!isAdmin || protectedMember || branchAccessMutation.isPending} onChange={(e) => branchAccessMutation.mutate({ userId: m.user_id, branchId: b.id, allowed: e.target.checked })} /></td>;
            })}
          </tr>;
        })}</tbody></table></div> : <p className="text-sm text-muted-foreground">No employees have joined this business yet.</p>}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-xl border p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 font-semibold"><span className="flex items-center gap-2"><GitBranch className="size-4 text-primary" />Branch delegation</span><span className="text-xs font-normal text-muted-foreground">Branch-scoped hiring authority</span></div>
          <div className="mt-4">
          <p className="mb-4 text-sm text-muted-foreground">Administrators can assign a Branch Manager to a branch and invite employees into positions permitted by the branch delegation.</p>
          <label className="mb-3 block text-sm">Branch
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={selectedBranchId} onChange={(e) => { setBranchId(e.target.value); setManagerUserId(''); }} disabled={!branches.length}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
            </select>
          </label>
          {isAdmin ? (
            <>
              <label className="mb-3 block text-sm">Branch Manager
                <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={managerUserId} onChange={(e) => setManagerUserId(e.target.value)}>
                  <option value="">Select a Branch Manager with branch access</option>
                  {eligibleManagers.map((m) => <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name || m.user_id.slice(0, 8)}</option>)}
                </select>
              </label>
              <div className="mb-4 space-y-2 text-sm">
                <p className="font-medium">Positions this manager may invite</p>
                {(['staff', 'viewer'] as const).map((r) => (
                  <label key={r} className="flex items-center gap-2"><input type="checkbox" checked={delegatedRoles.includes(r)} onChange={(e) => setDelegatedRoles((old) => e.target.checked ? [...old, r] : old.filter((x) => x !== r))} />{r === 'staff' ? 'Sales Person, Stock Manager and Store Team' : 'Read-only access'}</label>
                ))}
              </div>
              <Button disabled={!selectedManager || !delegatedRoles.length || grant.isPending} onClick={() => grant.mutate()}><Users className="mr-2 size-4" />{grant.isPending ? 'Saving…' : 'Grant branch delegation'}</Button>
            </>
          ) : currentGrant ? (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium">Delegation active for this branch</p>
              <p className="mt-1 text-muted-foreground">Allowed positions: {currentGrantRoles.map((r) => r === 'staff' ? 'Sales Person, Stock Manager and Store Team' : r === 'viewer' ? 'Read-only access' : r).join('; ')} · Up to {currentGrant.max_invite_uses} registrations · {currentGrant.max_invite_days} days</p>
            </div>
          ) : <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">No invitation delegation is assigned to your account for this branch. Ask an administrator to grant it.</p>}
          {isAdmin && (delegations.data?.grants ?? []).filter((g: { branch_id: string }) => g.branch_id === selectedBranchId).map((g: { id: string; manager_user_id: string; allowed_role_codes: string[] }) => (
            <div key={g.id} className="mt-3 flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <span>{members.find((m) => m.user_id === g.manager_user_id)?.profiles?.full_name || 'Branch Manager'} · {g.allowed_role_codes.map((r) => r === 'staff' ? 'Operational positions' : r === 'viewer' ? 'Read-only access' : r).join(', ')}</span>
              <Button size="sm" variant="outline" disabled={revokeGrant.isPending} onClick={() => revokeGrant.mutate(g.id)}><Ban className="mr-1 size-3" />Revoke</Button>
            </div>
          ))}
          </div>
        </section>
        <details name="team-access-sections" className="rounded-xl border p-4 md:p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><UserPlus className="size-4 text-primary" />Invite team member</span><span className="text-xs font-normal text-muted-foreground">Create a secure, branch-locked invitation</span></summary>
          <div className="mt-4">
          <p className="mb-4 text-sm text-muted-foreground">Every invitation is locked to one branch, one email, one Nepal mobile number and one use. The recipient must confirm the email and verify that mobile with Supabase Auth before joining.</p>
          <label className="mb-3 block text-sm">Branch
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={selectedBranchId} onChange={(e) => setBranchId(e.target.value)} disabled={!branches.length}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
            </select>
          </label>
          <label className="mb-3 block text-sm">Base access role
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as RoleCode)}>
              {allowedInviteRoles.map((role) => <option key={role} value={role}>{role === 'staff' ? 'Staff · POS only' : role.replaceAll('_',' ').replace(/\b\w/g,(v) => v.toUpperCase())}</option>)}
            </select>
          </label>
          {availableTitles.length > 0 && <label className="mb-3 block text-sm">HR position
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={jobTitle} onChange={(e) => setJobTitle(e.target.value as JobTitle)}>
              {availableTitles.map((t) => <option key={t} value={t}>{titleLabel[t]}</option>)}
            </select>
          </label>}
          <p className="mb-4 text-xs text-muted-foreground">Staff is the restricted POS-only base role. Base access controls application permissions; HR position is only the job designation. Assign extra operational roles after the invitation is accepted when the employee needs more screens.</p>
          <label className="mb-3 block text-sm">Invitee email address
            <input className="mt-1 h-10 w-full rounded-md border bg-background px-3" type="email" autoComplete="email" maxLength={254} placeholder="staff@example.com" value={inviteeEmail} onChange={(e) => setInviteeEmail(e.target.value)} />
          </label>
          <label className="mb-3 block text-sm">Invitee Nepal mobile number
            <input className="mt-1 h-10 w-full rounded-md border bg-background px-3" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="98XXXXXXXX" value={inviteeMobile} onChange={(e) => setInviteeMobile(e.target.value)} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">Link expiry (days)
              <input className="mt-1 h-10 w-full rounded-md border bg-background px-3" type="number" min={1} max={maxAllowedDays} value={effectiveExpiryDays} onChange={(e) => setExpiryDays(Math.max(1, Math.min(Number(e.target.value) || 1, currentGrant?.max_invite_days ?? 30)))} />
            </label>
          </div>
          <label className="my-3 block text-sm">Invitation label (optional)
            <input className="mt-1 h-10 w-full rounded-md border bg-background px-3" maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Nepalgunj cashier team" />
          </label>
          <Button className="w-full" disabled={!selectedBranchId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail.trim()) || !inviteMobileValid || !allowedInviteRoles.includes(inviteRole) || (jobTitle !== '' && !availableTitles.includes(jobTitle)) || createInvite.isPending} onClick={() => createInvite.mutate()}>
            <UserPlus className="mr-2 size-4" />{createInvite.isPending ? 'Creating link…' : 'Create invitation link'}
          </Button>
          {inviteLink && <div className="mt-3 rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">Share this private invitation link</p>
            <input aria-label="Team invitation link" readOnly className="h-10 w-full rounded-md border bg-background px-2 text-xs" value={inviteLink} />
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(inviteLink); setMessage('Invitation link copied.'); }}>Copy link</Button>
              <Button size="sm" variant="outline" onClick={() => { window.open(`https://wa.me/?text=${encodeURIComponent(`Join our team on Sutra: ${inviteLink}`)}`, '_blank', 'noopener,noreferrer'); }}>Share on WhatsApp</Button>
            </div>
          </div>}
          </div>
        </details>
      </div>

      {message && <p role="status" className="border-l-2 border-primary pl-3 text-sm">{message}</p>}

      <details name="team-access-sections" className="rounded-xl border p-4 md:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><Users className="size-4 text-primary" />Invitation history & activity</span><span className="text-xs font-normal text-muted-foreground">{(invitations.data?.invitations.length ?? 0) + legacyInvitations.length} invitations</span></summary>
        <div className="mt-4 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border p-4 md:p-5">
          <div className="mb-3 flex items-center gap-2"><Users className="size-4 text-primary" /><h4 className="font-semibold">Invitations</h4></div>
          {invitations.isPending ? <p className="text-sm text-muted-foreground">Loading branch-locked invitations…</p> : invitations.error ? <p role="alert" className="text-sm text-destructive">Branch-locked invitations could not be loaded.</p> : !(invitations.data?.invitations.length) ? <p className="text-sm text-muted-foreground">No branch-locked invitations yet.</p> : <div className="divide-y">{invitations.data.invitations.map((i: { id: string; branch_id: string; role_code: string; job_title: string | null; label: string | null; expires_at: string; max_uses: number; use_count: number; invitee_mobile_masked: string | null; invitee_email_masked: string | null; status: string; created_at: string }) => (
            <article key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0"><p className="font-medium">{i.label || titleLabel[(i.job_title ?? '') as JobTitle] || i.role_code}</p><p className="text-xs text-muted-foreground">{branches.find((b) => b.id === i.branch_id)?.name || 'Assigned branch'} · {i.invitee_email_masked || 'Email not bound'} · {i.invitee_mobile_masked || 'Mobile not bound'} · {i.status.replaceAll('_', ' ')} · created {new Date(i.created_at).toLocaleDateString()} · expires {new Date(i.expires_at).toLocaleDateString()}</p></div>
              {i.status === 'pending' || i.status === 'partially_used' ? <Button size="sm" variant="outline" disabled={revokeInvite.isPending} onClick={() => revokeInvite.mutate(i.id)}><Ban className="mr-1 size-3" />Revoke</Button> : null}
            </article>
          ))}</div>}
          <div className="mt-5 border-t pt-4">
            <h5 className="mb-1 text-sm font-semibold">Earlier invitations</h5>
            <p className="mb-2 text-xs text-muted-foreground">Existing invitations from the previous staff-invite flow remain valid and manageable here.</p>
            {!legacyInvitations.length ? <p className="text-sm text-muted-foreground">No earlier invitations.</p> : <div className="divide-y">{legacyInvitations.map((i) => {
              const status = i.accepted_at ? 'Accepted' : i.revoked_at ? 'Revoked' : new Date(i.expires_at).getTime() <= Date.now() ? 'Expired' : 'Pending';
              const open = !i.accepted_at && !i.revoked_at;
              return <article key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0"><p className="break-all font-medium">{i.invitee_name ? `${i.invitee_name} · ` : ''}{i.mobile ?? i.email ?? 'Invitee not identified'}</p><p className="text-xs text-muted-foreground">{(i.job_title && jobTitles[i.job_title as JobTitle]?.label) || i.role_code} · {status} · created {new Date(i.created_at).toLocaleDateString()} · expires {new Date(i.expires_at).toLocaleDateString()}</p></div>
                {open && <div className="flex flex-wrap items-center gap-2">
                  <select aria-label={`Change invited position for ${i.invitee_name || i.mobile || i.email || i.id}`} className="h-9 rounded-md border bg-card px-2 text-sm" value={i.job_title ?? ''} disabled={legacyActionsPending} onChange={(e) => { const next = e.target.value as JobTitle; if (next) onLegacyChangeRole?.(i.id, next); }}>
                    {!i.job_title && <option value="" disabled>{i.role_code}</option>}{legacyTitles.map((t) => <option key={t} value={t}>{jobTitles[t].label}</option>)}
                  </select>
                  <Button size="sm" variant="outline" disabled={legacyActionsPending} onClick={() => onLegacyReissue?.(i.id, i.mobile ?? '')}>New link</Button>
                  <Button size="sm" variant="ghost" disabled={legacyActionsPending} onClick={() => onLegacyRevoke?.(i.id)}><Ban className="mr-1 size-3" />Revoke</Button>
                </div>}
              </article>;
            })}</div>}
            {legacyInviteLink && <div className="mt-3 rounded-lg border p-3">
              <p className="mb-2 text-sm font-medium">New link for the earlier invitation</p>
              <input aria-label="New earlier invitation link" readOnly className="h-10 w-full rounded-md border bg-background px-2 text-xs" value={legacyInviteLink} />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(legacyInviteLink); }}>Copy link</Button>
                <Button size="sm" variant="outline" onClick={() => { window.open(`https://wa.me/?text=${encodeURIComponent(`Join our business on Sutra: ${legacyInviteLink}`)}`, '_blank', 'noopener,noreferrer'); }}>Share on WhatsApp</Button>
              </div>
            </div>}
          </div>
        </div>
        <div className="rounded-xl border p-4 md:p-5">
          <div className="mb-3 flex items-center gap-2"><ClipboardList className="size-4 text-primary" /><h4 className="font-semibold">Access activity</h4></div>
          {audit.isPending ? <p className="text-sm text-muted-foreground">Loading activity…</p> : audit.error ? <p role="alert" className="text-sm text-destructive">Activity could not be loaded.</p> : !(audit.data?.entries.length) ? <p className="text-sm text-muted-foreground">No delegation or invitation activity yet.</p> : <ul className="divide-y">{audit.data.entries.map((entry: { id: number; actor: string; action: string; created_at: string }) => <li key={entry.id} className="py-2 text-sm"><p className="font-medium">{entry.action.replaceAll('.', ' ')}</p><p className="text-xs text-muted-foreground">{entry.actor} · {new Date(entry.created_at).toLocaleString()}</p></li>)}</ul>}
        </div>
        </div>
      </details>
      </>}
      {viewMode !== 'employees' && <details name="team-access-sections" className="rounded-xl border p-4 md:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" />Position permissions</span><span className="text-xs font-normal text-muted-foreground">Configure the standard access for each position</span></summary>
        <div className="mt-4"><RolePermissions businessId={businessId} isOwner={isOwner} /></div>
      </details>}
    </section>
  );
}
