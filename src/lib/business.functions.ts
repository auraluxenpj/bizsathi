import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { accessRoleAssignmentInput, accessRoleCreateInput, accessRoleUpdateInput, acceptInput, branchGrantInput, branchInput, inviteInput, invitationRoleInput, memberInput, mobileInviteInput, registrationInput, removeMemberInput, revokeInviteInput, roleTemplateInput, roleTemplateResetInput, tenantInput } from './business-schemas';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyDb = (client: unknown) => client as SupabaseClient<any, 'public', any>;
const newToken = async () => { const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join(''); return { token, hash }; };

export const listBusinesses = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: isPlatformOwner, error: ownerError } = await anyDb(context.supabase).rpc('is_platform_owner');
  if (ownerError) throw new Error('Business access could not be loaded.');
  if (isPlatformOwner) {
    const { data, error } = await context.supabase.from('businesses').select('id,name,archived_at').is('archived_at', null).order('name');
    if (error) { console.error('Platform business query failed', error.code, error.message); throw new Error('Business access could not be loaded.'); }
    return (data ?? []).map(b => ({ id: b.id, name: b.name, role: 'owner', jobTitle: null, isPlatformOwner: true, effectiveRank: 100 }));
  }
  const { data, error } = await context.supabase.from('business_memberships').select('business_id,role_code,job_title,status,businesses!business_memberships_business_id_fkey(id,name,archived_at)').eq('user_id', context.userId).eq('status', 'active');
  if (error) { console.error('Business access query failed', error.code, error.message); throw new Error('Business access could not be loaded.'); }
  const memberships = (data ?? []).filter(m => m.businesses && !m.businesses.archived_at);
  return await Promise.all(memberships.map(async m => {
    const { data: effectiveRank, error: rankError } = await anyDb(context.supabase).rpc('business_role_rank', { _business_id: m.business_id, _user_id: context.userId });
    if (rankError) throw new Error('Business authority could not be verified.');
    return { id: m.business_id, name: m.businesses?.name ?? '', role: m.role_code, jobTitle: m.job_title ?? null, isPlatformOwner: false, effectiveRank: Number(effectiveRank ?? 0) };
  }));
});

export const registerBusiness = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(registrationInput).handler(async () => {
  throw new Error('Business registration is disabled. Contact the AURALUXE workspace administrator.');
});

export const getBusinessAccess = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(tenantInput).handler(async ({ data, context }) => {
  const [{ data: member, error: memberError }, { data: isPlatformOwner, error: ownerError }] = await Promise.all([
    context.supabase.rpc('is_business_member', { _business_id: data.businessId }),
    anyDb(context.supabase).rpc('is_platform_owner'),
  ]);
  if (ownerError) throw new Error('Platform authority could not be verified.');
  if (memberError || (!member && !isPlatformOwner)) throw new Error('Business membership is required.');
  const { data: businessAdmin, error: rankError } = await context.supabase.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'admin' });
  if (rankError) throw new Error('Business administration authority could not be verified.');
  // Platform Owner is a cross-business administrator without creating a normal business membership.
  const manager = Boolean(isPlatformOwner || businessAdmin);
  const { data: branches, error: branchError } = await context.supabase.from('branches').select('id,name,code,is_active,address').eq('business_id', data.businessId).order('name');
  if (branchError) {
    console.error('Business access branch query failed', branchError.code, branchError.message);
    throw new Error('Branches could not be loaded.');
  }
  if (!manager) return { manager: false, userId: context.userId, branches: branches ?? [], members: [], invitations: [], grants: [], memberRoles: [] };
  const [members, invitations, grants, memberRoles] = await Promise.all([
    context.supabase.from('business_memberships').select('user_id,role_code,job_title,status,profiles!business_memberships_user_id_fkey(full_name,phone)').eq('business_id', data.businessId),
    context.supabase.from('business_invitations').select('id,email,mobile,invitee_name,job_title,role_code,expires_at,accepted_at,revoked_at,created_at').eq('business_id', data.businessId).order('created_at', { ascending: false }),
    context.supabase.from('branch_memberships').select('user_id,branch_id').eq('business_id', data.businessId),
    anyDb(context.supabase).rpc('get_business_member_access_roles', { _business: data.businessId }),
  ]);
  const failed = [
    ['members', members.error], ['invitations', invitations.error], ['branch assignments', grants.error], ['member roles', memberRoles.error],
  ].find(([, error]) => error);
  if (failed) {
    const error = failed[1] as { code?: string; message?: string };
    console.error('Business staff access query failed', failed[0], error.code, error.message);
    throw new Error(`Staff access could not be loaded (${failed[0]}).`);
  }
  return { manager: true, userId: context.userId, branches: branches ?? [], members: members.data ?? [], invitations: invitations.data ?? [], grants: grants.data ?? [], memberRoles: memberRoles.data ?? [] };
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
  const [r, rd, effective] = await Promise.all([
    context.supabase.from('member_permission_denials').select('user_id,permission').eq('business_id', data.businessId),
    anyDb(context.supabase).rpc('member_role_denials', { _business: data.businessId }),
    anyDb(context.supabase).rpc('get_my_business_permissions', { _business: data.businessId }),
  ]);
  if (r.error) throw new Error('Permissions could not be loaded.');
  if (rd.error) throw new Error('Role permissions could not be loaded.');
  if (effective.error) throw new Error('Your effective access permissions could not be verified.');
  return { userId: context.userId, denials: r.data ?? [], roleDenials: (rd.data ?? []) as { user_id: string; permission: string }[], permissions: (effective.data ?? []).map((row: { permission: string }) => row.permission) };
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


// Business-scoped multi-role access. Role tables are not directly exposed to the browser;
// every read/write is performed through a guarded SECURITY DEFINER RPC.
export const getBusinessAccessRoles = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(tenantInput).handler(async ({ data, context }) => {
  const { data: roles, error } = await anyDb(context.supabase).rpc('get_business_access_roles', { _business: data.businessId });
  if (error) throw new Error('Business access roles could not be loaded.');
  return { roles: (roles ?? []) as { id: string; code: string; name: string; description: string | null; authorityRank: number; isSystem: boolean; isActive: boolean; permissions: string[] }[] };
});

export const getBusinessMemberAccessRoles = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(tenantInput).handler(async ({ data, context }) => {
  const { data: assignments, error } = await anyDb(context.supabase).rpc('get_business_member_access_roles', { _business: data.businessId });
  if (error) throw new Error('Employee role assignments could not be loaded.');
  return { assignments: (assignments ?? []) as { userId: string; roleId: string; roleCode: string; roleName: string; authorityRank: number; isDefault: boolean; assignedAt: string }[] };
});

export const createBusinessAccessRole = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(accessRoleCreateInput).handler(async ({ data, context }) => {
  const { data: roleId, error } = await anyDb(context.supabase).rpc('create_business_access_role', {
    _business: data.businessId, _name: data.name, _description: data.description ?? '',
    _authority_rank: data.authorityRank, _permissions: data.permissions,
  });
  if (error) throw new Error(error.message.replace(/^.*?: /, ''));
  return { roleId: roleId as string };
});

export const updateBusinessAccessRole = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(accessRoleUpdateInput).handler(async ({ data, context }) => {
  const { error } = await anyDb(context.supabase).rpc('update_business_access_role', {
    _business: data.businessId, _role: data.roleId, _name: data.name,
    _description: data.description ?? '', _permissions: data.permissions,
  });
  if (error) throw new Error(error.message.replace(/^.*?: /, ''));
  return { ok: true };
});

export const assignBusinessAccessRole = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(accessRoleAssignmentInput).handler(async ({ data, context }) => {
  const { error } = await anyDb(context.supabase).rpc('assign_business_access_role', {
    _business: data.businessId, _user: data.userId, _role: data.roleId,
  });
  if (error) throw new Error(error.message.replace(/^.*?: /, ''));
  return { ok: true };
});

export const unassignBusinessAccessRole = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(accessRoleAssignmentInput).handler(async ({ data, context }) => {
  const { error } = await anyDb(context.supabase).rpc('unassign_business_access_role', {
    _business: data.businessId, _user: data.userId, _role: data.roleId,
  });
  if (error) throw new Error(error.message.replace(/^.*?: /, ''));
  return { ok: true };
});
