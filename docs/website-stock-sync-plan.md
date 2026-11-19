# Auraluxe website stock sync

## Audit findings
- The website has a POST inventory API with comparison, persistent sale/return acknowledgements, acknowledgement completion, and conditional stock updates.
- BizSathi currently has no website-sync action. Stock counts must include both existing quantity ledgers.
- `INVENTORY_SYNC_SECRET` is not configured in BizSathi. Existing differently named website secrets will not be substituted silently. The same shared value must be entered securely in both apps.
- The website has one quantity per SKU, while BizSathi supports branches. Sync must use an explicitly selected fulfilment branch, not silently combine or distribute quantities across branches.
- Website acknowledgements represent quantity changes, not invoices. They cannot establish revenue, tax, customer identity or loyalty points.
- Existing stock retries are bound to the original actor; website acknowledgement recovery needs durable cross-administrator deduplication.

## What to build
1. Add **Sync with Website** to the stock ledger for Auraluxe owners/administrators, with an explicit website fulfilment branch selection and confirmation before the first agreement.
2. Compare active product/variant SKUs using case-insensitive, trimmed matching. Report missing, ambiguous, invalid and unsupported fractional quantities without silently changing them.
3. Read pending website sale/return quantity acknowledgements and atomically record each once in the existing branch stock ledger with its website reference. Keep pending acknowledgements recoverable if a call fails; do not create financial documents.
4. Mark an acknowledgement recorded on the website only after its local stock adjustment is durably confirmed.
5. Re-read stock and push BizSathi counts using the website's expected-current-count checks. Report concurrent sales as skipped/retry-needed, never overwrite them blindly.
6. Show comparison totals, adjustments recorded, counts updated, skipped SKUs and actionable failure states. Refresh the ledger after changes, including partial success.

## Safeguards and technical details
- Authenticated server functions verify Auraluxe membership, administrator role and branch access before any external request; no secret or privileged client reaches the browser.
- Add a tenant-scoped protected sync binding/recovery record through an additive migration, with explicit least-privilege grants, RLS, audit evidence and restricted RPCs.
- Use the existing business stock lock and append-only stock posting. Acknowledgement IDs are globally unique within this integration; changed payloads, branch reassignment after processing and duplicate retries are rejected.
- Pin each business to its selected branch; block another business from using the same website connection. Preserve all current stock and financial records.
- First agreement uses explicitly reviewed BizSathi stock as the authority; the website API cannot reconstruct sales predating its initial baseline.
- Server-only fetch to the exact supplied HTTPS endpoint, no redirects, bounded responses/timeouts and no automatic retries. Manual sync only; background syncing is not included.

## Verification and activation
- Test combined-ledger counts, active SKU matching, cross-user acknowledgement recovery, negative stock rejection, branch/tenant/role isolation and concurrent website changes.
- Verify the button, success/partial/error feedback and ledger refresh on desktop and mobile.
- Request `INVENTORY_SYNC_SECRET` through the secure shared-secret form after approval, then perform an authenticated read-only comparison before enabling the first stock-changing sync.
- Do not add synthetic business records or modify/publish the separate Auraluxe website. Live stock-changing verification requires confirmed SKU mapping and fulfilment branch.