import { describe, expect, it } from 'vitest';
import { acceptInput, branchInput, inviteInput, registrationInput } from './business-schemas';
const businessId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('Business foundation input rules', () => {
  it('does not allow invitations granting owner', () => expect(inviteInput.safeParse({ businessId, email: 'staff@example.test', role: 'owner' }).success).toBe(false));
  it('requires a business identity for invitations', () => expect(inviteInput.safeParse({ email: 'staff@example.test', role: 'staff' }).success).toBe(false));
  it('rejects invalid invitation tokens', () => expect(acceptInput.safeParse({ token: 'short' }).success).toBe(false));
  it('accepts a full 256-bit invitation token', () => expect(acceptInput.safeParse({ token: 'a'.repeat(64) }).success).toBe(true));
  it('permits registration without an optional PAN/VAT number', () => expect(registrationInput.safeParse({ name: 'Shop', legalName: '', panVat: '' }).success).toBe(true));
  it('requires a tenant for branch creation', () => expect(branchInput.safeParse({ name: 'Main', code: 'MAIN', address: '' }).success).toBe(false));
});