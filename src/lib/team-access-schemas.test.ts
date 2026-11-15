import { describe, expect, it } from 'vitest';
import { delegationGrantInput, teamInviteAcceptInput, teamInviteInput, teamInvitePreviewInput } from './team-access-schemas';
const businessId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const branchId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
describe('Team invitation input rules', () => {
  it('never allows an owner invitation', () => expect(teamInviteInput.safeParse({ businessId, branchId, role: 'owner' }).success).toBe(false));
  it('requires a branch so an invitation can never be business-wide', () => expect(teamInviteInput.safeParse({ businessId, role: 'staff' }).success).toBe(false));
  it('applies safe defaults: single use, 7 days, no extra restrictions', () => {
    const p = teamInviteInput.parse({ businessId, branchId, role: 'staff' });
    expect([p.maxUses, p.expiresInHours, p.deniedPermissions]).toEqual([1, 168, []]);
  });
  it('caps registrations at 100 and expiry at 30 days', () => {
    expect(teamInviteInput.safeParse({ businessId, branchId, role: 'staff', maxUses: 101 }).success).toBe(false);
    expect(teamInviteInput.safeParse({ businessId, branchId, role: 'staff', expiresInHours: 721 }).success).toBe(false);
    expect(teamInviteInput.safeParse({ businessId, branchId, role: 'staff', maxUses: 100, expiresInHours: 720 }).success).toBe(true);
  });
  it('rejects zero or fractional limits and malformed permission keys', () => {
    expect(teamInviteInput.safeParse({ businessId, branchId, role: 'staff', maxUses: 0 }).success).toBe(false);
    expect(teamInviteInput.safeParse({ businessId, branchId, role: 'staff', maxUses: 1.5 }).success).toBe(false);
    expect(teamInviteInput.safeParse({ businessId, branchId, role: 'staff', deniedPermissions: ["x'; drop table"] }).success).toBe(false);
  });
  it('accepts only a full 256-bit hex token for preview and accept', () => {
    for (const schema of [teamInvitePreviewInput, teamInviteAcceptInput]) {
      expect(schema.safeParse({ token: 'a'.repeat(64) }).success).toBe(true);
      expect(schema.safeParse({ token: 'A'.repeat(64) }).success).toBe(false);
      expect(schema.safeParse({ token: 'a'.repeat(63) }).success).toBe(false);
    }
  });
  it('delegation can never include admin or owner', () => {
    expect(delegationGrantInput.safeParse({ businessId, branchId, managerUserId: businessId, roles: ['admin'] }).success).toBe(false);
    expect(delegationGrantInput.safeParse({ businessId, branchId, managerUserId: businessId, roles: [] }).success).toBe(false);
    expect(delegationGrantInput.safeParse({ businessId, branchId, managerUserId: businessId, roles: ['staff', 'viewer'] }).success).toBe(true);
  });
});
