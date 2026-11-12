# Checkout loyalty redemption

## Audit findings
- Checkout already earns phone-linked points, but has no redemption option or spending record.
- Confirmation already protects stock, payments, accounting, and repeat requests in one atomic operation.
- Returns currently reverse earned points. Redemption also needs source-linked point restoration and discounted refund limits.

## What will change
- Show the customer's available points at checkout after entering a valid mobile number.
- Add an optional points-to-redeem field and a use-maximum action, at **100 points = NPR 1**. Whole points are accepted, so one point discounts NPR 0.01.
- Show the loyalty discount, revised payable total, remaining points, and points earned on the final discounted, tax-inclusive amount.
- Include the redemption and discount on receipt previews and saved sale receipts.
- Never spend more than the customer's available points or discount more than the eligible sale value. Points earned on the current sale cannot fund its own redemption.
- Save drafts without spending points; confirmation rechecks the current balance. Simultaneous checkouts and identical retries cannot spend the same points twice.
- Restore redeemed points proportionally on returns, with full restoration on a full return. Cash refunds stay limited to the discounted amount actually settled, and original earning-rate rules remain intact.
- If a return reverses points already spent elsewhere, retain the negative adjustment as evidence and block further redemption until the balance recovers; do not fabricate replacement points.

## Technical approach
- Extend the existing commerce posting contract and append-only loyalty evidence; keep the shared business lock, open-period protection, trusted permissions, and branch access checks.
- Record redemption separately from earning so customer purchase counts and legacy returns stay correct.
- Use exact decimal calculations for the preview and matching database calculations for posted discounts and tax snapshots. Preserve source-linked return pricing and existing quotation safeguards.
- Keep online and recovered-draft confirmation on the same posting path; cached balances never authorize spending.

## Verification
- Add focused tests for the selected exchange rate, available-balance limits, decimal rounding, returns, concurrent spending, permissions, and retry protection.
- Run isolated transaction tests without leaving synthetic records in the live business.
- Check signed-in desktop and mobile checkout and receipt previews using actual catalogue records; do not confirm a fabricated purchase.
- A live redemption and receipt read-back require a legitimate sale and a customer with earned points.