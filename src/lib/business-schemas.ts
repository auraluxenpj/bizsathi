import { z } from 'zod';

export const tenantInput = z.object({ businessId: z.string().uuid() });
export const registrationInput = z.object({ name: z.string().trim().min(1).max(200), legalName: z.string().trim().max(300), panVat: z.string().trim().refine(v => !v || /^[0-9]{9}$/.test(v), 'Enter a nine-digit PAN/VAT number or leave blank.') });
export const inviteInput = tenantInput.extend({ email: z.string().trim().toLowerCase().email().max(254), role: z.enum(['admin', 'accountant', 'staff', 'viewer']) });
export const acceptInput = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });
export const memberInput = tenantInput.extend({ userId: z.string().uuid(), role: z.enum(['admin', 'accountant', 'staff', 'viewer']), status: z.enum(['active', 'suspended']) });
export const branchInput = tenantInput.extend({ name: z.string().trim().min(1).max(200), code: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/), address: z.string().trim().max(500) });
export const branchGrantInput = tenantInput.extend({ userId: z.string().uuid(), branchId: z.string().uuid(), allowed: z.boolean() });
export const revokeInviteInput = tenantInput.extend({ invitationId: z.string().uuid() });
export const credentialsInput = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });