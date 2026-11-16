import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { delegationGrantInput, delegationListInput, delegationRevokeInput, teamInviteAcceptInput, teamInviteInput, teamInviteListInput, teamInvitePreviewInput, teamInviteRevokeInput } from './team-access-schemas';

// The tables/RPCs from migration 0042 are not in the generated Supabase types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyDb = (client: unknown) => client as SupabaseClient<any, 'public', any>;
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
// 256-bit random token; only its SHA-256 hash is stored. Same scheme as the existing invitation flow.
const newToken = async () => {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
  return { token, hash };
};
const hashOf = async (token: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
// 42501 = not authorised / unavailable (kept generic on purpose); P0001 = our own plain-language validation messages.
const friendly = (error: { code?: string; message?: string }, fallback: string) =>
  error.code === 'P0001' && error.message ? error.message : error.code === '42501' ? fallback : fallback;

export const createTeamInvitation = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(teamInviteInput).handler(async ({ data, context }) => {
  const { token, hash } = await newToken();
  const expiresAt = new Date(Date.now() + data.expiresInHours * 3_600_000).toISOString();
  const { data: invitationId, error } = await anyDb(context.supabase).rpc('create_team_invitation', {
    _business_id: data.businessId, _branch_id: data.branchId, _role: data.role, _job_title: data.jobTitle ?? null,
    _denied: data.deniedPermissions, _invitee_mobile: data.inviteeMobile, _token_hash: hash, _expires_at: expiresAt, _max_uses: data.maxUses, _label: data.label ?? null,
  });
  if (error) throw new Error(friendly(error, 'You are not allowed to invite this role into this branch.'));
  // The raw token is returned exactly once. The page builds `${origin}/join#token=...` (fragment: not sent to servers or logs).
  return { invitationId: invitationId as string, token, path: `/join#token=${token}`, expiresAt };
});

export const listTeamInvitations = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(teamInviteListInput).handler(async ({ data, context }) => {
  // Row Level Security decides what the caller can see: admins and the master owner see the business, managers see their own.
  let q = anyDb(context.supabase).from('team_invitations_status').select('id,branch_id,role_code,job_title,label,invited_by,expires_at,max_uses,use_count,revoked_at,created_at,invitee_mobile_masked,status').eq('business_id', data.businessId).order('created_at', { ascending: false }).limit(200);
  if (data.branchId) q = q.eq('branch_id', data.branchId);
  const { data: invitations, error } = await q;
  if (error) throw new Error('Invitations could not be loaded.');
  const ids = (invitations ?? []).map((i: { id: string }) => i.id);
  const { data: uses } = ids.length
    ? await anyDb(context.supabase).from('team_invitation_uses').select('invitation_id,user_id,accepted_at,profiles:user_id(full_name)').in('invitation_id', ids)
    : { data: [] };
  return { invitations: invitations ?? [], members: uses ?? [] };
});

export const revokeTeamInvitation = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(teamInviteRevokeInput).handler(async ({ data, context }) => {
  const { error } = await anyDb(context.supabase).rpc('revoke_team_invitation', { _invitation_id: data.invitationId });
  if (error) throw new Error('Invitation could not be revoked.');
  return { ok: true };
});

// Public preview for the signup page. No login needed, no ids or hashes returned, identical empty answer for every invalid token.
export const previewTeamInvitation = createServerFn({ method: 'POST' }).inputValidator(teamInvitePreviewInput).handler(async ({ data }) => {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env['SUPABASE_URL']; const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) return { invitation: null };
  const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: rows, error } = await anyDb(anon).rpc('preview_team_invitation', { _token_hash: await hashOf(data.token) });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (error || !row) return { invitation: null };
  return { invitation: { businessName: row.business_name as string, branchName: row.branch_name as string, roleName: row.role_name as string, jobTitle: (row.job_title ?? null) as string | null, inviterName: row.inviter_name as string, expiresAt: row.expires_at as string, seatsLeft: row.seats_left as number, inviteeMobileMasked: (row.invitee_mobile_masked ?? null) as string | null } };
});

// The database refuses unless BOTH email and mobile are verified in Supabase Auth, re-checks the inviter's authority, and serialises concurrent acceptances.
export const acceptTeamInvitation = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(teamInviteAcceptInput).handler(async ({ data, context }) => {
  const { data: businessId, error } = await anyDb(context.supabase).rpc('accept_team_invitation', { _token_hash: await hashOf(data.token) });
  if (error) throw new Error('This invitation is unavailable, expired, full, or your email and mobile number are not both verified yet.');
  return { businessId: businessId as string };
});

export const grantBranchDelegation = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(delegationGrantInput).handler(async ({ data, context }) => {
  const { data: grantId, error } = await anyDb(context.supabase).rpc('grant_branch_delegation', {
    _business_id: data.businessId, _branch_id: data.branchId, _manager: data.managerUserId, _roles: data.roles, _max_uses: data.maxUses, _max_days: data.maxDays,
  });
  if (error) throw new Error(friendly(error, 'You are not allowed to delegate this authority.'));
  return { grantId: grantId as string };
});

export const revokeBranchDelegation = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(delegationRevokeInput).handler(async ({ data, context }) => {
  const { error } = await anyDb(context.supabase).rpc('revoke_branch_delegation', { _grant_id: data.grantId });
  if (error) throw new Error('Delegation could not be revoked.');
  return { ok: true };
});

export const listBranchDelegations = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(delegationListInput).handler(async ({ data, context }) => {
  const { data: grants, error } = await anyDb(context.supabase).from('delegation_grants').select('id,branch_id,manager_user_id,allowed_role_codes,can_invite,max_invite_uses,max_invite_days,created_at,revoked_at').eq('business_id', data.businessId).is('revoked_at', null).order('created_at', { ascending: false });
  if (error) throw new Error('Delegations could not be loaded.');
  return { grants: grants ?? [] };
});

// Access-related audit trail for admins and the master owner (row level security hides it from everyone else).
export const listAccessAudit = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(delegationListInput).handler(async ({ data, context }) => {
  const db = anyDb(context.supabase);
  const { data: rows, error } = await db.from('audit_logs').select('id,actor_id,action,entity_id,created_at').eq('business_id', data.businessId)
    .or('action.like.team_invite.%,action.like.delegation.%,action.like.job_title.%').order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error('Activity log could not be loaded.');
  const actorIds = [...new Set((rows ?? []).map((r: { actor_id: string | null }) => r.actor_id).filter(Boolean))] as string[];
  const { data: people } = actorIds.length ? await db.from('profiles').select('id,full_name').in('id', actorIds) : { data: [] };
  const names = Object.fromEntries((people ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? 'Unknown']));
  return { entries: (rows ?? []).map((r: { id: number; actor_id: string | null; action: string; entity_id: string | null; created_at: string }) => ({ id: r.id, action: r.action, entityId: r.entity_id, created_at: r.created_at, actor: r.actor_id ? names[r.actor_id] ?? 'Unknown' : 'System' })) };
});
