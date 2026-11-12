// Plain-language reasons for the database's business rules, and a pre-check that mirrors them so a person is
// told what to fix before pressing Confirm. The database still enforces every rule; this only explains them.

const reasons: [RegExp, string][] = [
  [/^Walk-in sale must be paid in full$/, 'This sale has no customer, so it must be paid in full. Add a payment, or choose a customer to sell on credit.'],
  [/^Walk-in return requires/, 'A return with no customer must be refunded in full straight away.'],
  [/^Your open (cash )?counter is required$/, 'Your cash counter is not open. Open it first, or take this payment by bank or wallet.'],
  [/^(Insufficient counter cash|Cash out exceeds counter cash)$/, 'There is not enough cash in your counter for this.'],
  [/^Insufficient stock/, 'Not enough stock for one of these items in this branch. Receive stock first or lower the quantity.'],
  [/^An open financial period covering this date is required$/, 'No open financial year covers this date.'],
  [/^Payment exceeds outstanding amount$/, 'That payment is more than what is still owed.'],
  [/^(Counter|Document|Payment) access denied$/, 'You do not have access to this branch or action.'],
  [/^Tax rate must match/, 'A VAT rate on one of the lines does not match your business VAT settings.'],
  [/^Request identifier conflict$/, 'This request was already used with different details. Start it again.'],
  [/^Contact required$/, 'Choose a customer or supplier for this document.'],
  [/^Active matching contact required$/, 'The chosen customer or supplier is not active.'],
  [/^Insufficient account balance$/, 'That account does not have enough balance for this.'],
  [/^Account type does not match/, 'The chosen account is the wrong type for this payment (bank, wallet or cash safe).'],
  [/^Account is not active$/, 'That account has been switched off.'],
  [/^Account not found$/, 'That account could not be found.'],
  [/^Cash from the counter is not tagged/, 'Counter cash goes to the till, not to a named account.'],
  [/^Balance is already correct$/, 'The balance is already that amount.'],
  [/^Invalid (transfer|balance|account details|account choices)$/, 'Please check the amount and accounts and try again.'],
  [/^Account access denied$/, 'Only accountants and administrators can manage accounts.'],
  [/^Payment does not belong to this document$/, 'That payment does not belong to this sale.'],
  [/^Loyalty points balance is lower than the points requested$/, 'The customer does not have enough loyalty points for this. Check their balance again and lower the points to use.'],
  [/^Loyalty points cannot cover the whole sale$/, 'Points cannot pay for the whole sale. Keep at least a little payable, or use fewer points.'],
  [/^Loyalty discount (must equal|exceeds)|^Invalid loyalty redemption$/, 'The loyalty discount did not match the points used. Reopen the sale and try again.'],
  [/^Restored loyalty points exceed/, 'Those points were already given back for this sale.'],
  [/^Discount exceeds line amount$/, 'A discount is larger than the line amount.'],
];

/** The explanation for one of the database's own messages, or null for anything unexpected (which stays generic). */
export function friendlyCommerceError(message: string | null | undefined): string | null {
  const text = (message ?? '').trim();
  return reasons.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

export type ConfirmCheck = {
  kind: string; hasLines: boolean; hasPeriod: boolean; party: string; mobileOk: boolean; balanceDue: number;
  hasCashPayment: boolean; hasOpenCounter: boolean; shortStock: { name: string; onHand: number }[];
};
/** Why Confirm cannot succeed yet, or null when nothing obvious is in the way. */
export function confirmBlockReason(c: ConfirmCheck): string | null {
  if (!c.hasLines) return 'Add at least one item.';
  if (!c.hasPeriod) return 'No open financial year covers this date.';
  if (c.kind === 'purchase' && !c.party) return 'Choose a supplier.';
  if (c.kind === 'sale' && !c.mobileOk) return 'Enter the customer’s 10-digit mobile number.';
  if (c.kind === 'sale' && c.shortStock.length) { const s = c.shortStock[0]!; return `Not enough stock for ${s.name} (${s.onHand} in stock here). Receive stock first or lower the quantity.`; }
  if (c.kind === 'sale' && !c.party && c.balanceDue > 0.005) return 'No customer is chosen, so this sale must be paid in full. Add a payment, or choose a customer to sell on credit.';
  if (c.hasCashPayment && !c.hasOpenCounter) return 'Cash needs your cash counter open.';
  return null;
}
