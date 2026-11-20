# Auraluxe website stock sync

## Implementation status

The manual integration is implemented in the migration branch:

- `src/components/website-stock-sync.tsx` adds **Sync with Website** to the stock ledger for authorized managers, with an explicit fulfilment branch, comparison view and confirmation before stock changes.
- `src/lib/website-sync.functions.ts` exposes authenticated compare and sync server functions.
- `src/lib/website-sync.run.server.ts` coordinates a leased sync run.
- `src/lib/website-sync.server.ts` sends bounded HTTPS requests to the exact configured API path, rejects redirects and validates the response.
- `src/lib/sheet-stock-in.functions.ts` supports Stock In sheet → branch ledger → website.
- `drizzle/migrations/0022_website_stock_sync.sql` creates the branch binding, lease, append-only acknowledgement evidence and guarded RPCs.

The integration is **implemented but not activated or end-to-end verified against the live website**.

## Current activation checks

- The production AURALUXE database has the `website_stock_sync` table but currently has no website branch binding. The selected Nepalgunj branch must be reviewed and explicitly bound by the first confirmed sync.
- The existing Cloudflare Worker has an `INVENTORY_SYNC_SECRET` secret binding by name. Secret values are intentionally not readable through the Cloudflare API, and the matching website-side value has not been verified. The same strong secret must be configured securely in both systems.
- Only one product variant is currently present in the AURALUXE database. Confirm its SKU against the website before the first baseline agreement.
- First agreement treats the reviewed BizSathi stock as authoritative. The website API cannot reconstruct sales that predate the baseline.
- No live stock-changing sync has been run as part of this review.

## Data and safety model

- The website has one quantity per SKU, while BizSathi supports branches. Sync uses one explicitly selected fulfilment branch; it never combines or distributes branch stock implicitly.
- Website acknowledgements represent quantity changes, not invoices. They cannot establish revenue, tax, customer identity or loyalty points.
- Pending website sale/return acknowledgements are recorded once in the existing branch stock ledger with their website reference. The append-only `website_stock_acknowledgements` table and unique operation IDs support deduplication across administrator retries.
- The website is told an acknowledgement is recorded only after the local stock adjustment has committed.
- Counts are pushed with expected-current-count checks. Concurrent website sales are reported as skipped/retry-needed, never overwritten blindly.
- Active SKU matching is case-insensitive and trimmed. Missing, ambiguous, invalid and fractional quantities are reported rather than silently changed.
- Authenticated server functions verify Auraluxe administrator and branch access before external requests. Secrets and privileged credentials remain server-side.
- The website connection is pinned to one business and one branch. Existing stock and financial records are preserved.
- Requests are server-only, HTTPS-only, no-redirect, bounded by response size and timeout. Sync is manual; background syncing is not included.

## Remaining verification before activation

1. Confirm the website-side shared secret matches the Worker secret without exposing it in chat or source control.
2. Confirm the website endpoint is live at the configured non-redirecting HTTPS URL.
3. Review the active SKU mapping and Nepalgunj fulfilment branch.
4. Run a read-only comparison and reconcile every discrepancy.
5. Only then approve the first stock-changing baseline sync.
6. Verify retries, cross-administrator acknowledgement recovery, negative stock rejection, branch/tenant/role isolation and concurrent website changes.
7. Verify the button, success/partial/error feedback and ledger refresh on desktop and mobile.

Do not add synthetic business records or modify/publish the separate Auraluxe website as part of these checks.
