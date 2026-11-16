import { describe, expect, it } from 'vitest';
import { delegationGrantInput, teamInviteAcceptInput, teamInviteInput, teamInvitePreviewInput } from './team-access-schemas';

const businessId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const branchId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const validInvite = { businessId, branchId, role: 'staff', inviteeEmail: 'staff@example.com', inviteeMobile: '9812345678' };

describe('Team invitation input rules', () => {
  it('never allows an owner invitation', () => expect(teamInviteInput.safeParse({ ...validInvite, role: 'owner' }).success).toBe(false));
  it('requires a branch so an invitation can never be business-wide', () => expect(teamInviteInput.safeParse({ businessId, role: 'staff', inviteeEmail: 'staff@example.com', inviteeMobile: '9812345678' }).success).toBe(false));
  it('requires a valid Nepal mobile and defaults to a single-use 7-day invitation', () => {
    const p = teamInviteInput.parse(validInvite);
    expect([p.maxUses, p.expiresInHours, p.deniedPermissions]).toEqual([1, 168, []]);
    expect(teamInviteInput.safeParse({ ...validInvite, inviteeMobile: '8812345678' }).success).toBe(false);
    expect(teamInviteInput.safeParse({ ...validInvite, inviteeEmail: 'not-an-email' }).success).toBe(false);
  });
  it('caps invitation expiry at 30 days and rejects multi-use phone-bound links', () => {
    expect(teamInviteInput.safeParse({ ...validInvite, expiresInHours: 721 }).success).toBe(false);
    expect(teamInviteInput.safeParse({ ...validInvite, maxUses: 2 }).success).toBe(false);
    expect(teamInviteInput.safeParse({ ...validInvite, expiresInHours: 720 }).success).toBe(true);
  });
  it('rejects invalid limits and malformed permission keys', () => {
    expect(teamInviteInput.safeParse({ ...validInvite, expiresInHours: 0 }).success).toBe(false);
    expect(teamInviteInput.safeParse({ ...validInvite, expiresInHours: 1.5 }).success).toBe(false);
    expect(teamInviteInput.safeParse({ ...validInvite, deniedPermissions: ["x'; drop table"] }).success).toBe(false);
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
