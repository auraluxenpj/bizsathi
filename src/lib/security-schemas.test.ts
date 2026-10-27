import { describe, expect, it } from 'vitest';
import { findingInput, impactSchema, isAdministrator } from './security-schemas';
describe('Security review permissions', () => {
  it('allows active administrators', () => expect(isAdministrator('admin', 'active')).toBe(true));
  it('allows active owners', () => expect(isAdministrator('owner', 'active')).toBe(true));
  it('denies staff', () => expect(isAdministrator('staff', 'active')).toBe(false));
  it('denies suspended administrators', () => expect(isAdministrator('admin', 'suspended')).toBe(false));
  it('rejects a finding without tenant identity', () => expect(findingInput.safeParse({ title: 'Leak', details: 'Private data' }).success).toBe(false));
  it('requires remediation verification', () => expect(impactSchema.safeParse({ impact: 'Leak', severity: 'high', assumptions: [], steps: [{ priority: 'P1', action: 'Restrict access', rationale: 'Privacy' }] }).success).toBe(false));
});