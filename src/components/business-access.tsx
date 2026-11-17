import { useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { changeInvitationRole, createBranch, getBusinessAccess, listBusinesses, reissueInvitation, removeMember, revokeInvitation, setBranchAccess, updateMember } from '@/lib/business.functions';
import { RolePermissions } from './role-permissions';
import { PermissionChecklist } from './permission-checklist';
import { TeamAccessPanel } from './team-access-panel';
import { jobTitles, jobTitleCodes, type JobTitle } from '@/lib/job-titles';
import { branchInput } from '@/lib/business-schemas';
type BusinessRole = 'admin' | 'branch_manager' | 'accountant' | 'staff' | 'viewer';

const roleCards: Record<string, { name: string; about: string }> = {
  admin: { name: 'Administrator', about: 'Manage staff, items, parties and settings.' },
  branch_manager: { name: 'Branch Manager', about: 'Manage only assigned branches, delegated team and branch approvals.' },
  accountant: { name: 'Accountant', about: 'Financial periods, vouchers and reports.' },
  staff: { name: 'Staff', about: 'Day-to-day selling, payments and stock.' },
  viewer: { name: 'Viewer', about: 'View only. Cannot change anything.' },
};

export function BusinessAccess() {
 const view=useSearch({strict:false});const client = useQueryClient(); const [selectedBusinessId, setSelectedBusinessId] = useState('');
 const listFn = useServerFn(listBusinesses); const accessFn = useServerFn(getBusinessAccess); const reissueFn = useServerFn(reissueInvitation); const roleChangeFn = useServerFn(changeInvitationRole); const removeFn = useServerFn(removeMember); const branchFn = useServerFn(createBranch); const memberFn = useServerFn(updateMember); const grantFn = useServerFn(setBranchAccess); const revokeFn = useServerFn(revokeInvitation);
 const businesses = useQuery({ queryKey: ['businesses'], queryFn: () => listFn() });
 const businessId = businesses.data?.length ? (businesses.data.some(b => b.id === selectedBusinessId) ? selectedBusinessId : businesses.data[0]?.id ?? '') : '';
 const business = businesses.data?.find(b => b.id === businessId);
 const access = useQuery({ queryKey: ['business-access', businessId], queryFn: () => accessFn({ data: { businessId } }), enabled: Boolean(businessId) });

 const [branchName, setBranchName] = useState(''); const [code, setCode] = useState(''); const [address, setAddress] = useState(''); const [message, setMessage] = useState(''); const [legacyInviteLink, setLegacyInviteLink] = useState('');
 const refresh = () => client.invalidateQueries({ queryKey: ['business-access', businessId] });
 const reissue = useMutation({ mutationFn: (v: { id: string; mobile: string }) => reissueFn({ data: { businessId, invitationId: v.id } }).then(r => ({ ...r, mobile: v.mobile })), onSuccess: r => { setLegacyInviteLink(`${window.location.origin}/invite#token=${r.token}`); setMessage('New link created. The old link no longer works.'); refresh(); }, onError: e => setMessage(e.message) });
 const changeRole = useMutation({ mutationFn: (v: { id: string; jobTitle: JobTitle }) => roleChangeFn({ data: { businessId, invitationId: v.id, jobTitle: v.jobTitle } }), onSuccess: () => { setMessage('Invitation role changed.'); refresh(); }, onError: e => setMessage(e.message) });
 const remove = useMutation({ mutationFn: (userId: string) => removeFn({ data: { businessId, userId } }), onSuccess: () => { setMessage('Staff member removed.'); refresh(); }, onError: e => setMessage(e.message) });
 const branch = useMutation({ mutationFn: () => branchFn({ data: branchInput.parse({ businessId, name: branchName, code, address }) }), onSuccess: () => { setBranchName(''); setCode(''); setAddress(''); setMessage('Branch added.'); refresh(); }, onError: e => setMessage(e.message) });
 const member = useMutation({ mutationFn: (data: Parameters<typeof memberFn>[0]['data']) => memberFn({ data }), onSuccess: () => { setMessage('Staff access updated.'); refresh(); }, onError: e => setMessage(e.message) });
 const grant = useMutation({ mutationFn: (data: Parameters<typeof grantFn>[0]['data']) => grantFn({ data }), onSuccess: () => { setMessage('Branch access updated.'); refresh(); }, onError: e => setMessage(e.message) });
 const revoke = useMutation({ mutationFn: (invitationId: string) => revokeFn({ data: { businessId, invitationId } }), onSuccess: () => { setMessage('Invitation revoked.'); setLegacyInviteLink(''); refresh(); }, onError: e => setMessage(e.message) });
 const titles = jobTitleCodes.filter(t => business?.role === 'owner' || jobTitles[t].base !== 'admin');
 return <main className="mx-auto max-w-6xl px-5 py-8 md:px-10">
  <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-5"><h1 className="brand text-3xl">BizSathi Nepal</h1><div className="flex gap-2"><Button asChild variant="outline"><Link to="/security"><ShieldCheck />Security desk</Link></Button><Button asChild variant="ghost" size="icon" title="Profile"><Link to="/profile"><UserRound /></Link></Button></div></header>
  <div className="my-8 flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold text-primary">BUSINESS ACCESS</p><h2 className="brand mt-2 text-2xl">{view.panel==='roles'?'Positions & permissions':view.panel==='users'?'Employees & branch access':'AURALUXE workspace & staff'}</h2></div></div>
  {(businesses.isPending || (businessId && access.isPending)) && <p role="status">Loading business access…</p>}
  {(businesses.error || access.error) && <p role="alert" className="text-destructive">{businesses.error?.message || access.error?.message}</p>}
  {message && <p role="status" className="mb-6 border-l-2 border-primary pl-3 text-sm">{message}</p>}
  {!businesses.isPending && !businesses.error && !businessId && <section className="my-6 rounded-xl border p-5"><h3 className="font-semibold">{businesses.data?.length ? 'Workspace setup needs attention' : 'AURALUXE workspace access required'}</h3><p className="mt-2 text-sm text-muted-foreground">{businesses.data?.length ? 'This account has more than one business membership. Ask the workspace owner to complete the single-workspace setup before continuing.' : 'Your account is not yet linked to the AURALUXE workspace. Ask an AURALUXE administrator for a staff invitation, then accept it here.'}</p></section>}
  {businesses.data && businesses.data.length > 1 && <label className="my-5 block max-w-xl text-sm font-medium">Business workspace<select className="mt-2 h-11 w-full rounded-md border bg-background px-3" value={businessId} onChange={e => setSelectedBusinessId(e.target.value)}>{businesses.data.map(b => <option key={b.id} value={b.id}>{b.name} · {b.role === 'owner' ? 'Platform Owner' : b.role}</option>)}</select></label>}
  {businessId && <>
  {view.panel !== 'roles' && <section className="border-y py-7"><h3 className="brand text-xl">Branches</h3>{!access.data?.branches.length && <p className="mt-4 text-sm text-muted-foreground">No authorized branches available.</p>}<ul className="my-5 divide-y">{access.data?.branches.map(b => <li key={b.id} className="flex flex-wrap justify-between gap-2 py-3"><span>{b.name} <span className="text-xs text-muted-foreground">{b.code}</span></span><span className="text-sm text-muted-foreground">{b.is_active ? 'Active' : 'Inactive'}</span></li>)}</ul>{access.data?.manager && <form className="grid gap-3 sm:grid-cols-4" onSubmit={e => { e.preventDefault(); branch.mutate(); }}><Input aria-label="Branch name" placeholder="Branch name" required maxLength={200} value={branchName} onChange={e => setBranchName(e.target.value)} /><Input aria-label="Branch code" placeholder="Branch code" required pattern="[A-Za-z0-9_-]{1,20}" maxLength={20} value={code} onChange={e => setCode(e.target.value)} /><Input aria-label="Branch address" placeholder="Address (optional)" maxLength={500} value={address} onChange={e => setAddress(e.target.value)} /><Button disabled={branch.isPending}><Plus />Add branch</Button></form>}</section>}
  <TeamAccessPanel businessId={businessId} branches={access.data?.branches ?? []} members={access.data?.members ?? []} branchAccess={access.data?.grants ?? []} userId={access.data?.userId ?? ''} isAdmin={Boolean(access.data?.manager)} isOwner={business?.role === 'owner'} viewMode={view.panel === 'roles' ? 'positions' : view.panel === 'users' ? 'employees' : 'all'} legacyInvitations={access.data?.invitations ?? []} legacyTitles={titles} onLegacyReissue={(id, mobile) => reissue.mutate({ id, mobile })} onLegacyChangeRole={(id, jobTitle) => changeRole.mutate({ id, jobTitle })} onLegacyRevoke={(id) => { if (window.confirm('Revoke this invitation?')) revoke.mutate(id); }} legacyActionsPending={reissue.isPending || changeRole.isPending || revoke.isPending} legacyInviteLink={legacyInviteLink} />

  </>}
 </main>;
}
