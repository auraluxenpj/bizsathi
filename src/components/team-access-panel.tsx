import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { GitBranch, ShieldCheck, Users, UserPlus, Ban, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { jobTitles, type JobTitle } from '@/lib/job-titles';
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

const hierarchy = [
  { title: 'CEO / Platform Owner', rank: 100, detail: 'Global authority across businesses, branches and delegation', tone: 'border-primary/40 bg-primary/5' },
  { title: 'Administrator / Partner', rank: 80, detail: 'Business administration and manager appointments', tone: 'border-border bg-card' },
  { title: 'Store Manager', rank: 60, detail: 'Assigned branches and delegated team hiring', tone: 'border-border bg-card' },
  { title: 'Accountant', rank: 60, detail: 'Vouchers, financial periods and P&L audits', tone: 'border-border bg-card' },
  { title: 'Inventory Manager', rank: 40, detail: 'Stock ledger, purchase orders and catalog', tone: 'border-border bg-muted/40' },
  { title: 'Cashier / POS', rank: 40, detail: 'POS checkout, sales invoices and loyalty', tone: 'border-border bg-muted/40' },
  { title: 'Store Team', rank: 40, detail: 'Basic daily entries and view-only stock', tone: 'border-border bg-muted/40' },
] as const;

const titleByRole: Record<string, JobTitle[]> = {
  admin: ['partner'],
  accountant: ['manager', 'accountant'],
  staff: ['sales_person', 'stock_manager', 'entry_person'],
  viewer: [],
};
const titleLabel: Record<JobTitle, string> = {
  partner: 'Administrator / Partner',
  manager: 'Store Manager',
  accountant: 'Accountant',
  sales_person: 'Cashier / POS',
  stock_manager: 'Inventory Manager',
  entry_person: 'Store Team',
};
const roleRank: Record<string, number> = { owner: 100, admin: 80, accountant: 60, staff: 40, viewer: 20 };

export function TeamAccessPanel({
  businessId, branches, members, branchAccess, userId, isAdmin, isOwner,
}: {
  businessId: string;
  branches: Branch[];
  members: Member[];
  branchAccess: BranchAccess[];
  userId: string;
  isAdmin: boolean;
  isOwner: boolean;
}) {
  const client = useQueryClient();
  const listInvitesFn = useServerFn(listTeamInvitations);
  const listDelegationsFn = useServerFn(listBranchDelegations);
  const listAuditFn = useServerFn(listAccessAudit);
  const createInviteFn = useServerFn(createTeamInvitation);
  const grantFn = useServerFn(grantBranchDelegation);
  const revokeGrantFn = useServerFn(revokeBranchDelegation);
  const revokeInviteFn = useServerFn(revokeTeamInvitation);

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
  const [roleCode, setRoleCode] = useState('staff');
  const [jobTitle, setJobTitle] = useState<JobTitle>('sales_person');
  const [label, setLabel] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [message, setMessage] = useState('');

  const currentGrant = delegations.data?.grants.find((g: { branch_id: string; manager_user_id: string }) =>
    g.branch_id === selectedBranchId && g.manager_user_id === userId);
  const currentGrantRoles = (currentGrant?.allowed_role_codes ?? []) as string[];
  const allowedInviteRoles = isAdmin
    ? (isOwner ? ['admin', 'accountant', 'staff', 'viewer'] : ['accountant', 'staff', 'viewer'])
    : currentGrantRoles.filter((r) => (roleRank[r] ?? 100) < 60);
  const maxAllowedDays = currentGrant?.max_invite_days ?? 30;
  const effectiveExpiryDays = Math.min(expiryDays, maxAllowedDays);
  const inviteMobileValid = Boolean(normalizeVerifiedNepalMobile(inviteeMobile));
  const availableTitles = titleByRole[roleCode] ?? [];
  const eligibleManagers = members.filter((m) =>
    m.status === 'active' && m.job_title === 'manager' &&
    branchAccess.some((g) => g.user_id === m.user_id && g.branch_id === selectedBranchId));
  const selectedManager = eligibleManagers.find((m) => m.user_id === managerUserId);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['team-invitations', businessId] });
    void client.invalidateQueries({ queryKey: ['team-delegations', businessId] });
    void client.invalidateQueries({ queryKey: ['team-access-audit', businessId] });
  };

  const createInvite = useMutation({
    mutationFn: () => createInviteFn({ data: {
      businessId, branchId: selectedBranchId, role: roleCode as 'admin' | 'accountant' | 'staff' | 'viewer', inviteeEmail, inviteeMobile,
      jobTitle: availableTitles.includes(jobTitle) ? jobTitle : undefined,
      deniedPermissions: [], expiresInHours: effectiveExpiryDays * 24, maxUses: 1, label: label || undefined,
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
      roles: delegatedRoles as ('accountant' | 'staff' | 'viewer')[],
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
  const revokeInvite = useMutation({
    mutationFn: (invitationId: string) => revokeInviteFn({ data: { invitationId } }),
    onSuccess: () => { setMessage('Invitation revoked.'); setInviteLink(''); refresh(); },
    onError: () => setMessage('Invitation could not be revoked.'),
  });

  return (
    <section className="space-y-7 border-b py-7" aria-labelledby="team-access-heading">
      <div>
        <div className="flex items-center gap-2 text-primary"><ShieldCheck className="size-4" /><p className="text-xs font-semibold tracking-wide">TEAM ACCESS & DELEGATION</p></div>
        <h3 id="team-access-heading" className="brand mt-2 text-2xl">Role hierarchy</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Rank sets the maximum authority a role may delegate. Actual access is controlled by security permissions and branch assignments.</p>
      </div>

      <div className="mx-auto grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {hierarchy.map((item, index) => (
          <article key={item.title} className={`rounded-xl border p-4 ${item.tone} ${index === 0 ? 'sm:col-span-2 lg:col-span-4 lg:mx-auto lg:w-1/2' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold">{item.title}</h4>
              <span className="rounded-full bg-background px-2 py-1 text-xs font-semibold tabular-nums">Rank {item.rank}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border p-4 md:p-5">
          <div className="mb-4 flex items-center gap-2"><GitBranch className="size-4 text-primary" /><h4 className="font-semibold">Branch delegation</h4></div>
          <p className="mb-4 text-sm text-muted-foreground">Administrators can grant a Store Manager permission to invite only lower-ranked roles in a specific branch.</p>
          <label className="mb-3 block text-sm">Branch
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={selectedBranchId} onChange={(e) => { setBranchId(e.target.value); setManagerUserId(''); }} disabled={!branches.length}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
            </select>
          </label>
          {isAdmin ? (
            <>
              <label className="mb-3 block text-sm">Store Manager
                <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={managerUserId} onChange={(e) => setManagerUserId(e.target.value)}>
                  <option value="">Select a manager with branch access</option>
                  {eligibleManagers.map((m) => <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name || m.user_id.slice(0, 8)}</option>)}
                </select>
              </label>
              <div className="mb-4 space-y-2 text-sm">
                <p className="font-medium">Roles the manager may delegate</p>
                {(['staff', 'viewer'] as const).map((r) => (
                  <label key={r} className="flex items-center gap-2"><input type="checkbox" checked={delegatedRoles.includes(r)} onChange={(e) => setDelegatedRoles((old) => e.target.checked ? [...old, r] : old.filter((x) => x !== r))} />{r === 'staff' ? 'Cashier / POS, Inventory Manager and Store Team' : 'Viewer (read only)'}</label>
                ))}
              </div>
              <Button disabled={!selectedManager || !delegatedRoles.length || grant.isPending} onClick={() => grant.mutate()}><Users className="mr-2 size-4" />{grant.isPending ? 'Saving…' : 'Grant branch delegation'}</Button>
            </>
          ) : currentGrant ? (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium">Delegation active for this branch</p>
              <p className="mt-1 text-muted-foreground">Allowed roles: {currentGrantRoles.join(', ')} · Up to {currentGrant.max_invite_uses} registrations · {currentGrant.max_invite_days} days</p>
            </div>
          ) : <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">No invitation delegation is assigned to your account for this branch. Ask an administrator to grant it.</p>}
          {isAdmin && (delegations.data?.grants ?? []).filter((g: { branch_id: string }) => g.branch_id === selectedBranchId).map((g: { id: string; manager_user_id: string; allowed_role_codes: string[] }) => (
            <div key={g.id} className="mt-3 flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <span>{members.find((m) => m.user_id === g.manager_user_id)?.profiles?.full_name || 'Store Manager'} · {g.allowed_role_codes.join(', ')}</span>
              <Button size="sm" variant="outline" disabled={revokeGrant.isPending} onClick={() => revokeGrant.mutate(g.id)}><Ban className="mr-1 size-3" />Revoke</Button>
            </div>
          ))}
        </div>

        <div className="rounded-xl border p-4 md:p-5">
          <div className="mb-4 flex items-center gap-2"><UserPlus className="size-4 text-primary" /><h4 className="font-semibold">Invite team member</h4></div>
          <p className="mb-4 text-sm text-muted-foreground">Every invitation is locked to one branch, one email, one Nepal mobile number and one use. The recipient must confirm the email and verify that mobile with Supabase Auth before joining.</p>
          <label className="mb-3 block text-sm">Branch
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={selectedBranchId} onChange={(e) => setBranchId(e.target.value)} disabled={!branches.length}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
            </select>
          </label>
          <label className="mb-3 block text-sm">Role
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={roleCode} onChange={(e) => { setRoleCode(e.target.value); setJobTitle((titleByRole[e.target.value] ?? [])[0] ?? 'sales_person'); }}>
              {allowedInviteRoles.map((r) => <option key={r} value={r}>{r === 'admin' ? 'Administrator / Partner' : r === 'accountant' ? 'Store Manager / Accountant' : r === 'staff' ? 'Operational Team' : 'Viewer'}</option>)}
            </select>
          </label>
          {availableTitles.length > 0 && <label className="mb-3 block text-sm">Position
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={jobTitle} onChange={(e) => setJobTitle(e.target.value as JobTitle)}>
              {availableTitles.map((t) => <option key={t} value={t}>{titleLabel[t]}</option>)}
            </select>
          </label>}
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
          <Button className="w-full" disabled={!selectedBranchId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail.trim()) || !inviteMobileValid || !allowedInviteRoles.includes(roleCode) || createInvite.isPending} onClick={() => createInvite.mutate()}>
            <UserPlus className="mr-2 size-4" />{createInvite.isPending ? 'Creating link…' : 'Create invitation link'}
          </Button>
          {inviteLink && <div className="mt-3 rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">Share this private invitation link</p>
            <input aria-label="Team invitation link" readOnly className="h-10 w-full rounded-md border bg-background px-2 text-xs" value={inviteLink} />
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(inviteLink); setMessage('Invitation link copied.'); }}>Copy link</Button>
              <Button size="sm" variant="outline" onClick={() => { window.open(`https://wa.me/?text=${encodeURIComponent(`Join our team on BizSathi: ${inviteLink}`)}`, '_blank', 'noopener,noreferrer'); }}>Share on WhatsApp</Button>
            </div>
          </div>}
        </div>
      </div>

      {message && <p role="status" className="border-l-2 border-primary pl-3 text-sm">{message}</p>}

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border p-4 md:p-5">
          <div className="mb-3 flex items-center gap-2"><Users className="size-4 text-primary" /><h4 className="font-semibold">Branch invitations</h4></div>
          {invitations.isPending ? <p className="text-sm text-muted-foreground">Loading invitations…</p> : invitations.error ? <p role="alert" className="text-sm text-destructive">Invitations could not be loaded.</p> : !(invitations.data?.invitations.length) ? <p className="text-sm text-muted-foreground">No team invitations yet.</p> : <div className="divide-y">{invitations.data.invitations.map((i: { id: string; branch_id: string; role_code: string; job_title: string | null; label: string | null; expires_at: string; max_uses: number; use_count: number; invitee_mobile_masked: string | null; invitee_email_masked: string | null; status: string }) => (
            <article key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div><p className="font-medium">{i.label || titleLabel[(i.job_title ?? '') as JobTitle] || i.role_code}</p><p className="text-xs text-muted-foreground">{branches.find((b) => b.id === i.branch_id)?.name || 'Assigned branch'} · {i.invitee_email_masked || 'Email not bound'} · {i.invitee_mobile_masked || 'Mobile not bound'} · expires {new Date(i.expires_at).toLocaleDateString()} · {i.status.replace('_', ' ')}</p></div>
              {i.status === 'pending' || i.status === 'partially_used' ? <Button size="sm" variant="outline" disabled={revokeInvite.isPending} onClick={() => revokeInvite.mutate(i.id)}><Ban className="mr-1 size-3" />Revoke</Button> : null}
            </article>
          ))}</div>}
        </div>
        <div className="rounded-xl border p-4 md:p-5">
          <div className="mb-3 flex items-center gap-2"><ClipboardList className="size-4 text-primary" /><h4 className="font-semibold">Access activity</h4></div>
          {audit.isPending ? <p className="text-sm text-muted-foreground">Loading activity…</p> : audit.error ? <p role="alert" className="text-sm text-destructive">Activity could not be loaded.</p> : !(audit.data?.entries.length) ? <p className="text-sm text-muted-foreground">No delegation or invitation activity yet.</p> : <ul className="divide-y">{audit.data.entries.map((entry: { id: number; actor: string; action: string; created_at: string }) => <li key={entry.id} className="py-2 text-sm"><p className="font-medium">{entry.action.replaceAll('.', ' ')}</p><p className="text-xs text-muted-foreground">{entry.actor} · {new Date(entry.created_at).toLocaleString()}</p></li>)}</ul>}
        </div>
      </div>
      <div className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><p>Role titles describe the job. Rank and server-enforced permissions determine authority. Branch access and delegation are separate grants; removing either stops further access.</p></div>
    </section>
  );
}
