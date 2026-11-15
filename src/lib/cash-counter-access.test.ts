import { describe, expect, it } from 'vitest';
import { canSeeExpectedCash, scopeCashCounterReport } from './cash-counter-access';

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


describe('scopeCashCounterReport', () => {
  const sessions = [
    { id: 'own', openedById: 'cashier-1' },
    { id: 'other', openedById: 'cashier-2' },
  ];
  it('limits billing staff to sessions they opened', () => {
    expect(scopeCashCounterReport(sessions, 'staff', 'cashier-1').map((s) => s.id)).toEqual(['own']);
  });
  it('keeps the full authorized report for managers and accountants', () => {
    expect(scopeCashCounterReport(sessions, 'admin', 'manager-1')).toEqual(sessions);
    expect(scopeCashCounterReport(sessions, 'accountant', 'accountant-1')).toEqual(sessions);
  });
  it('fails closed for missing or unrecognized roles', () => {
    expect(scopeCashCounterReport(sessions, undefined, 'user-1')).toEqual([]);
    expect(scopeCashCounterReport(sessions, 'unknown', 'user-1')).toEqual([]);
  });
});
