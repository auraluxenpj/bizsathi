import { describe, expect, it } from 'vitest';
import { canSeeExpectedCash } from './cash-counter-access';

describe('canSeeExpectedCash', () => {
  it.each(['owner', 'admin', 'accountant'])('lets %s see the expected cash', (role) => {
    expect(canSeeExpectedCash(role)).toBe(true);
  });
  it('makes staff count blind', () => {
    expect(canSeeExpectedCash('staff')).toBe(false);
  });
  it('fails closed for unknown, empty or missing roles', () => {
    expect(canSeeExpectedCash('')).toBe(false);
    expect(canSeeExpectedCash('manager')).toBe(false);
    expect(canSeeExpectedCash(undefined)).toBe(false);
    expect(canSeeExpectedCash(null)).toBe(false);
  });
  it('is case-sensitive so a malformed role never unlocks the figure', () => {
    expect(canSeeExpectedCash('Owner')).toBe(false);
  });
});
