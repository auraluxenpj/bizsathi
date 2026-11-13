// Who may see the expected drawer cash while a counter is open.
// Everyone else counts blind, so the closing count is a real check rather than a copy of the screen.
// This is a screen-level rule only: it does not change what the database returns to the browser.

const EXPECTED_CASH_ROLES = ['owner', 'admin', 'accountant'];

/** Unknown, missing or still-loading roles fail closed (blind). */
export function canSeeExpectedCash(role: string | null | undefined): boolean {
  return !!role && EXPECTED_CASH_ROLES.includes(role);
}
