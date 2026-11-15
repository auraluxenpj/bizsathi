// Who may see the expected drawer cash while a counter is open.
// Everyone else counts blind, so the closing count is a real check rather than a copy of the screen.
// This is a screen-level rule only: it does not change what the database returns to the browser.

const EXPECTED_CASH_ROLES = ['owner', 'admin', 'accountant'];

/** Unknown, missing or still-loading roles fail closed (blind). */
export function canSeeExpectedCash(role: string | null | undefined): boolean {
  return !!role && EXPECTED_CASH_ROLES.includes(role);
}


/** Cashiers may report only on sessions they opened; managers/accountants retain the full report. */
export function scopeCashCounterReport<T extends { openedById: string }>(sessions: T[], role: string | null | undefined, jobTitle: string | null | undefined, userId: string): T[] {
  if (role === 'staff' && jobTitle === 'sales_person') return sessions.filter((session) => session.openedById === userId);
  return role && EXPECTED_CASH_ROLES.includes(role) ? sessions : [];
}
