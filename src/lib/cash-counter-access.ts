// Who may see expected drawer cash while a counter is open.
const EXPECTED_CASH_ROLES = ['owner', 'admin', 'accountant'];

/** Unknown, missing or still-loading roles fail closed (blind). */
export function canSeeExpectedCash(role: string | null | undefined): boolean {
  return !!role && EXPECTED_CASH_ROLES.includes(role);
}

/** Cashiers see the active shared branch session plus their own historical sessions. */
export function scopeCashCounterReport<T extends { openedById: string; closed?: boolean }>(
  sessions: T[],
  role: string | null | undefined,
  jobTitle: string | null | undefined,
  userId: string,
): T[] {
  if (role === 'staff' && jobTitle === 'sales_person') {
    return sessions.filter((session) => !session.closed || session.openedById === userId);
  }
  return role && [...EXPECTED_CASH_ROLES, 'branch_manager'].includes(role) ? sessions : [];
}
