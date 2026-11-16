import { z } from 'zod';
import { tenantInput } from './business-schemas';
import { normalizeVerifiedNepalMobile } from './login-identifier';

// Input rules for branch-scoped team invitations and delegation.
// The browser only ever sends ids and choices; every authority check is repeated in the database RPCs.
const uuid = z.string().uuid();
const jobTitle = z.enum(['partner', 'manager', 'branch_manager', 'accountant', 'sales_person', 'stock_manager', 'entry_person']);
const permissionKey = z.string().regex(/^[a-z_]+\.[a-z_]+$/).max(60);
export const invitationToken = z.string().regex(/^[a-f0-9]{64}$/);

export const teamInviteInput = tenantInput.extend({
  branchId: uuid,
  role: z.enum(['admin', 'branch_manager', 'accountant', 'staff', 'viewer']), // 'owner' can never be invited
  inviteeEmail: z.string().trim().toLowerCase().email().max(254),
  inviteeMobile: z.string().trim().min(10).max(40).refine(value => Boolean(normalizeVerifiedNepalMobile(value)), 'Enter a valid Nepal mobile number.'),
  jobTitle: jobTitle.optional(),
  deniedPermissions: z.array(permissionKey).max(80).default([]),
  expiresInHours: z.number().int().min(1).max(720).default(168), // 1 hour .. 30 days, default 7 days
  maxUses: z.literal(1).default(1),
  label: z.string().trim().max(120).optional(),
});
export const teamInviteListInput = tenantInput.extend({ branchId: uuid.optional() });
export const teamInviteRevokeInput = z.object({ invitationId: uuid });
export const teamInvitePreviewInput = z.object({ token: invitationToken });
export const teamInviteAcceptInput = z.object({ token: invitationToken });

export const delegationGrantInput = tenantInput.extend({
  branchId: uuid,
  managerUserId: uuid,
  roles: z.array(z.enum(['accountant', 'staff', 'viewer'])).min(1).max(3), // delegable roles are always below admin
  maxUses: z.number().int().min(1).max(100).default(25),
  maxDays: z.number().int().min(1).max(30).default(14),
});
export const delegationRevokeInput = z.object({ grantId: uuid });
export const delegationListInput = tenantInput;

export type InvitationStatus = 'pending' | 'partially_used' | 'accepted' | 'expired' | 'revoked';
