# Mobile membership and purchase points

## Audit findings
- Sales currently allow customers without a mobile number; the local POS drafts have no mobile field.
- Customer phone numbers are free-form, and there is no membership or points history yet.
- Existing sale confirmation already protects stock, accounting and retries in a single transaction. Membership and points must use the same protection.

## Requested changes
1. Require a valid mobile number before confirming any new sale, including sales from local drafts after reconnecting. Unconfirmed drafts may remain incomplete; existing posted sales stay unchanged.
2. Create one mobile membership per business, displayed as **AL-<mobile number>**. Normalize spaces, separators and Nepal +977 prefixes to the same local mobile number; require a valid 10-digit Nepal mobile beginning with 97 or 98.
3. Earn **one point per NPR 100** on each confirmed sale, based on the final amount after discounts and including tax. Award whole points rounded down per sale: NPR 250 earns 2 points; NPR 99 earns 0. Points accumulate across purchases using the same mobile number.
4. Deduct earned points when goods are returned, based on the original sale's remaining net amount. Partial returns and repeated returns must never deduct more than that sale earned. Historical sales without loyalty awards remain unaffected.
5. Show the membership, points earned and accumulated balance in sale details/receipts and a searchable membership list. Points are earned only; redemption is outside this change.
6. Preserve the mobile number inside encrypted local drafts and unchanged retry requests. Never award points for drafts, supplier purchases, payment collection or duplicate retries.

## Technical safeguards
- Use additive tenant-scoped membership and immutable points-history records, trusted database authorization, explicit least-privilege grants, and row-level access controls.
- Enforce mobile validation and calculate points during the existing atomic database posting operation, with unique source-document evidence to prevent duplicate awards.
- Do not merge existing customer records by phone or change existing invoice customer references automatically; link new loyalty identity to sale evidence separately.
- Preserve existing posting, stock, accounting, closed-period and exact-request retry rules.

## Verification
- Add concrete tests for required mobile, normalized AL- identity, NPR 100 earning rate, rounding, accumulation, retry deduplication, return adjustments and tenant/branch isolation.
- Exercise online and local-draft sales flows; run related existing tests.
- No synthetic live business records. Successful live posting remains dependent on legitimate products, branches and an open financial period.