import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { acceptInput, branchGrantInput, branchInput, inviteInput, memberInput, registrationInput, revokeInviteInput, tenantInput } from './business-schemas';

export const listBusinesses = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from('business_memberships').select('business_id,role_code,status,businesses(id,name,archived_at)').eq('user_id', context.userId).eq('status', 'active');
  if (error) throw new Error('Business access could not be loaded.');
  return (data ?? []).filter(m => m.businesses && !m.businesses.archived_at).map(m => ({ id: m.business_id, name: m.businesses?.name ?? '', role: m.role_code }));
});

export const registerBusiness = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(registrationInput).handler(async ({ data, context }) => {
  const { data: id, error } = await context.supabase.rpc('create_business', { _name: data.name, _legal_name: data.legalName, _pan_vat: data.panVat });
  if (error) throw new Error('Business registration failed. Check the details and try again.');
  return { id };
});

export const getBusinessAccess = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(tenantInput).handler(async ({ data, context }) => {
  const { data: member, error } = await context.supabase.rpc('is_business_member', { _business_id: data.businessId });
  if (error || !member) throw new Error('Business membership is required.');
  const { data: manager } = await context.supabase.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'admin' });
  const { data: branches, error: branchError } = await context.supabase.from('branches').select('id,name,code,is_active,address').eq('business_id', data.businessId).order('name');
  if (branchError) throw new Error('Branches could not be loaded.');
  if (!manager) return { manager: false, userId: context.userId, branches: branches ?? [], members: [], invitations: [], grants: [] };
  const [members, invitations, grants] = await Promise.all([
    context.supabase.from('business_memberships').select('user_id,role_code,status,profiles!business_memberships_user_id_fkey(full_name)').eq('business_id', data.businessId),
    context.supabase.from('business_invitations').select('id,email,role_code,expires_at,accepted_at,revoked_at,created_at').eq('business_id', data.businessId).order('created_at', { ascending: false }),
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
  const { error } = await context.supabase.rpc('create_business_invitation', { _business_id: data.businessId, _email: data.email, _role: data.role, _token_hash: hash });
  if (error) throw new Error('Invitation could not be created. You can invite only roles below your own.');
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
  const { error } = await context.supabase.rpc('update_business_member', { _business_id: data.businessId, _user_id: data.userId, _role: data.role, _status: data.status });
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
});