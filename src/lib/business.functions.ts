import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { acceptInput, branchGrantInput, branchInput, inviteInput, invitationRoleInput, memberInput, mobileInviteInput, registrationInput, removeMemberInput, revokeInviteInput, roleTemplateInput, roleTemplateResetInput, tenantInput } from './business-schemas';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyDb = (client: unknown) => client as SupabaseClient<any, 'public', any>;
const newToken = async () => { const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join(''); return { token, hash }; };

export const listBusinesses = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from('business_memberships').select('business_id,role_code,status,businesses!business_memberships_business_id_fkey(id,name,archived_at)').eq('user_id', context.userId).eq('status', 'active');
  if (error) { console.error('Business access query failed', error.code, error.message); throw new Error('Business access could not be loaded.'); }
  return (data ?? []).filter(m => m.businesses && !m.businesses.archived_at).map(m => ({ id: m.business_id, name: m.businesses?.name ?? '', role: m.role_code }));
});

export const registerBusiness = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(registrationInput).handler(async () => {
  throw new Error('Business registration is disabled. Contact the AURALUXE workspace administrator.');
});

export const getBusinessAccess = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(tenantInput).handler(async ({ data, context }) => {
  const { data: member, error } = await context.supabase.rpc('is_business_member', { _business_id: data.businessId });
  if (error || !member) throw new Error('Business membership is required.');
  const { data: manager } = await context.supabase.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'admin' });
  const { data: branches, error: branchError } = await context.supabase.from('branches').select('id,name,code,is_active,address').eq('business_id', data.businessId).order('name');
  if (branchError) throw new Error('Branches could not be loaded.');
  if (!manager) return { manager: false, userId: context.userId, branches: branches ?? [], members: [], invitations: [], grants: [] };
  const [members, invitations, grants] = await Promise.all([
    context.supabase.from('business_memberships').select('user_id,role_code,job_title,status,profiles!business_memberships_user_id_fkey(full_name,phone)').eq('business_id', data.businessId),
    context.supabase.from('business_invitations').select('id,email,mobile,invitee_name,job_title,role_code,expires_at,accepted_at,revoked_at,created_at').eq('business_id', data.businessId).order('created_at', { ascending: false }),
    context.supabase.from('branch_memberships').select('user_id,branch_id').eq('business_id', data.businessId),
  ]);
  if (members.error || invitations.error || grants.error) throw new Error('Staff access could not be loaded.');
  return { manager: true, userId: context.userId, branches: branches ?? [], members: members.data ?? [], invitations: invitations.data ?? [], grants: grants.data ?? [] };
});

export const createInvitation = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(inviteInput).handler(async ({ data, context }) => {
  const { data: allowed, error: permissionError } = await context.supabase.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'admin' });
  if (permissionError || !allowed) throw new Error('Administrator access is required.');
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('');
  const { data: invitationId, error } = await context.supabase.rpc('create_business_invitation', { _business_id: data.businessId, _email: data.email, _role: data.role, _token_hash: hash });
  if (error) throw new Error('Invitation could not be created. You can invite only roles below your own.');
  if (data.jobTitle && invitationId) await anyDb(context.supabase).rpc('set_invitation_job_title', { _business: data.businessId, _invitation: invitationId as string, _title: data.jobTitle });
  return { token };
});

export const acceptInvitation = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(acceptInput).handler(async ({ data, context }) => {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data.token))), b => b.toString(16).padStart(2, '0')).join('');
  const { data: businessId, error } = await context.supabase.rpc('accept_business_invitation', { _token_hash: hash });
  if (error) throw new Error('Invitation is unavailable, expired, or belongs to another verified email account. Existing members cannot accept again.');
  return { businessId };
});

export const revokeInvitation = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(revokeInviteInput).handler(async ({ data, context }) => {
  const { error } = await context.supabase.rpc('revoke_business_invitation', { _business_id: data.businessId, _invitation_id: data.invitationId });
  if (error) throw new Error('Invitation could not be revoked.');
  return { ok: true };
});

export const updateMember = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(memberInput).handler(async ({ data, context }) => {
  const { error } = data.jobTitle
    ? await anyDb(context.supabase).rpc('set_member_job_title', { _business: data.businessId, _user: data.userId, _title: data.jobTitle })
    : await context.supabase.rpc('update_business_member', { _business_id: data.businessId, _user_id: data.userId, _role: data.role, _status: data.status });
  if (error) throw new Error('Membership could not be changed. Your own role and equal or higher roles are protected.');
  return { ok: true };
});

export const createBranch = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(branchInput).handler(async ({ data, context }) => {
  const { data: allowed, error: permissionError } = await context.supabase.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'admin' });
  if (permissionError || !allowed) throw new Error('Administrator access is required.');
  const { error } = await context.supabase.from('branches').insert({ business_id: data.businessId, name: data.name, code: data.code, address: data.address || null });
  if (error) throw new Error('Branch could not be added. Branch codes must be unique.');
  return { ok: true };
});

export const setBranchAccess = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(branchGrantInput).handler(async ({ data, context }) => {
  const { error } = await context.supabase.rpc('set_branch_access', { _business_id: data.businessId, _branch_id: data.branchId, _user_id: data.userId, _allowed: data.allowed });
  if (error) throw new Error('Branch access could not be changed.');
  return { ok: true };
});import { permissionInput } from './permissions';
export const getMemberPermissions = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(tenantInput).handler(async ({ data, context }) => {
  const r = await context.supabase.from('member_permission_denials').select('user_id,permission').eq('business_id', data.businessId);
  if (r.error) throw new Error('Permissions could not be loaded.');
  const rd = await anyDb(context.supabase).rpc('member_role_denials', { _business: data.businessId });
  return { userId: context.userId, denials: r.data ?? [], roleDenials: (rd.error ? [] : rd.data ?? []) as { user_id: string; permission: string }[] };
});
export const saveMemberPermissions = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(permissionInput).handler(async ({ data, context }) => {
  const r = await context.supabase.rpc('set_member_permissions', { _business: data.businessId, _user: data.userId, _denied: data.denied });
  if (r.error) throw new Error(r.error.message.replace(/^.*?: /, ''));
  return { ok: true };
});

const isAdmin = async (context: { supabase: unknown }, businessId: string) => { const { data: ok } = await anyDb(context.supabase).rpc('has_business_role', { _business_id: businessId, _min_role: 'admin' }); if (!ok) throw new Error('Administrator access is required.'); };
const friendly = (m: string | undefined, fallback: string) => m && /mobile number is required|Only the owner|no longer open|already accepted/i.test(m) ? m.replace(/^.*?: /, '') : fallback;

export const createMobileInvitation = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(mobileInviteInput).handler(async ({ data, context }) => {
  await isAdmin(context, data.businessId);
  const { token, hash } = await newToken();
  const { error } = await anyDb(context.supabase).rpc('create_business_invitation_v2', { _business_id: data.businessId, _mobile: data.mobile, _name: data.name ?? '', _title: data.jobTitle, _token_hash: hash });
  if (error) throw new Error(friendly(error.message, 'Invitation could not be created. You can invite only roles below your own.'));
  return { token };
});

export const reissueInvitation = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(revokeInviteInput).handler(async ({ data, context }) => {
  await isAdmin(context, data.businessId);
  const { token, hash } = await newToken();
  const { error } = await anyDb(context.supabase).rpc('reissue_invitation', { _business: data.businessId, _invitation: data.invitationId, _token_hash: hash });
  if (error) throw new Error(friendly(error.message, 'A new link could not be created.'));
  return { token };
});

export const changeInvitationRole = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(invitationRoleInput).handler(async ({ data, context }) => {
  const { error } = await anyDb(context.supabase).rpc('change_invitation_role', { _business: data.businessId, _invitation: data.invitationId, _title: data.jobTitle });
  if (error) throw new Error(friendly(error.message, 'The role could not be changed.'));
  return { ok: true };
});

export const removeMember = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(removeMemberInput).handler(async ({ data, context }) => {
  const { error } = await anyDb(context.supabase).rpc('remove_business_member', { _business_id: data.businessId, _user_id: data.userId });
  if (error) throw new Error('This member could not be removed. Your own role and equal or higher roles are protected.');
  return { ok: true };
});

export const getRoleTemplates = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(tenantInput).handler(async ({ data, context }) => {
  const { data: t, error } = await anyDb(context.supabase).rpc('get_role_templates', { _business: data.businessId });
  if (error) throw new Error('Role permissions could not be loaded.');
  return { templates: t as Record<string, { customized: boolean; denied: string[] }> };
});

export const saveRoleTemplate = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(roleTemplateInput).handler(async ({ data, context }) => {
  const { error } = await anyDb(context.supabase).rpc('set_role_template', { _business: data.businessId, _title: data.jobTitle, _denied: data.denied });
  if (error) throw new Error(friendly(error.message, 'Role permissions could not be saved.'));
  return { ok: true };
});

export const resetRoleTemplate = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(roleTemplateResetInput).handler(async ({ data, context }) => {
  const { error } = await anyDb(context.supabase).rpc('reset_role_template', { _business: data.businessId, _title: data.jobTitle });
  if (error) throw new Error(friendly(error.message, 'Role permissions could not be reset.'));
  return { ok: true };
});
