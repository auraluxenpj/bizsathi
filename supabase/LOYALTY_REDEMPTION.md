# Checkout loyalty redemption

**Rate:** 100 points = NPR 1 (one point = NPR 0.01). Whole points only.

## How it works
- At checkout (confirmed sales only) the cashier sees the customer's available points and can enter points to use, or press "Use maximum".
- The discount is added to each line's ordinary `discount` (split in proportion, to the paisa) and labelled `loyaltyDiscount`. `post_commerce_document` is not changed, so VAT, receivables, journals, the receipt total and the points earned all use the discounted amount.
- Migration `0034_loyalty_redemption.sql` extends the loyalty trigger and adds the append-only `loyalty_redemptions` table (negative `spend` row per sale, positive `restore` row per return).
- Balance = `loyalty_point_events` + `loyalty_redemptions`. The balance shown at checkout is display-only.

## Safeguards
- **Double spending:** the spend is checked inside the posting transaction under the business advisory lock, so two checkouts cannot spend the same points. A second guard trigger on the table repeats the check. One spend per sale (unique index). Identical retries return the same document and spend nothing; a retry with different details is rejected.
- **No self-funding:** the check runs before the sale's own points are earned.
- **No tampering:** points must equal the labelled line discounts × 100, and each label cannot exceed that line's real discount. Bad or missing values reject the whole sale.
- **Never covers the whole sale:** at least NPR 0.01 stays payable (needed to restore points in proportion).
- **Drafts spend nothing.** Confirmation re-checks the live balance.
- **Returns:** points come back in proportion to the value returned (all of them once the sale is fully returned), never more than were spent. Earned points reverse as before. Cash refunds stay limited to the discounted amount actually settled, because returns reuse the sale's stored discounted line prices.
- **Negative balance:** if a return reverses points already spent elsewhere, the negative balance is kept as evidence and blocks redemption until it recovers.

## Not included
Quotation-converted sales and the offline POS do not redeem points. Accounting treats the loyalty discount as a sales discount (revenue is recorded net).
