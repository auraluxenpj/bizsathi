# Auraluxe website inventory integration

## Implementation status

The legacy manual sync remains available for comparison only. The transactional foundation is now implemented in this feature branch:

- `drizzle/migrations/0107_website_inventory_reservations.sql` adds SKU-only atomic reservations, idempotent commit/cancel/status RPCs, a committed website movement ledger included in BizSathi stock balances, stock guards that protect active reservations from native BizSathi deductions, and a durable publication outbox. Migration `0110_website_inventory_serialization.sql` makes native deductions use the same business transaction lock as reservations.
- `src/routes/api.public.website-inventory.ts` exposes the service-authenticated reserve/commit/cancel/status/outbox API.
- The outbox publisher attempts to send revised sellable quantities to the website projection endpoint after each reservation/finalization and on a five-minute Cloudflare schedule. Migration `0110` leases only the oldest unpublished event; an active lease, retry backoff, or dead-lettered head blocks later absolute projections so an older event cannot overwrite newer stock.
- The integration binding is seeded disabled. The service route refuses new reservations until the Auraluxe branch binding is explicitly enabled.
- An isolated SQL regression suite covers reservation retries, oversell prevention, commit/cancel, native stock guards, and FIFO outbox leasing. The new serialization migration and strengthened tests require a fresh CI run.

The existing **manual legacy sync** is implemented in this branch:

- `src/components/website-stock-sync.tsx` adds an admin comparison and confirmed sync flow for a selected fulfilment branch.
- `src/lib/website-sync.functions.ts` exposes authenticated compare and sync server functions.
- `src/lib/website-sync.run.server.ts` coordinates a leased sync run.
- `src/lib/website-sync.server.ts` sends bounded HTTPS requests to the exact configured API path, rejects redirects and validates the response.
- `src/lib/sheet-stock-in.functions.ts` supports Stock In sheet → branch ledger → website.
- `drizzle/migrations/0022_website_stock_sync.sql` creates the branch binding, lease, append-only acknowledgement evidence and guarded RPCs.
- `drizzle/migrations/0023_fix_auraluxe_website_sync_tenant.sql` corrects the stale Auraluxe business UUID in the manual sync tenant guards.

This legacy protocol is **not** the approved end-state. It compares and pushes absolute counts; it does not provide atomic checkout reservations, transactional order commit/cancel, a durable movement outbox, or end-to-end two-way POS integration. The branch changes remain in Git and the migrations have not been applied.

## Approved authority and transaction model

BizSathi is the single source of truth for Auraluxe inventory. The Nepalgunj branch is the selected fulfilment branch. The website is a sales channel and availability projection; it must not independently own or overwrite stock.

1. Website checkout reserves the requested SKU quantities atomically in BizSathi before the website accepts the order.
2. Confirmed order commits the same reservation exactly once to the BizSathi stock ledger.
3. Cancellation releases only its own active reservation. A committed sale requires a bounded return, not a reservation release.
4. BizSathi POS sales post to the same ledger and publish the new sellable availability.
5. Purchase receipts, accepted returns, and authorized adjustments update the same ledger and publish a new revision.
6. Offline POS drafts do not affect stock until successfully committed online.
7. Every mutation has an idempotency key and a durable status. Unknown outcomes are reconciled by that original key; retries must not duplicate movements.
8. SKU mismatches, duplicate mappings, stale revisions, insufficient stock and uncertain events are flagged. No name-based matching, silent stock overwrite, or silent quantity correction is allowed.

SKU is the only mapping key. Every orderable website SKU must map one-to-one to an active BizSathi variant SKU. No size or colour mapping is used, so the website availability guarantee is SKU-level only.

## Current activation checks and historical evidence

- The production BizSathi Auraluxe business and Nepalgunj branch IDs have been verified in prior read-only checks. The tenant guard in the original manual sync migration used a stale business UUID; the Git-only roll-forward migration corrects it.
- The previous verified BizSathi snapshot contained 407 active products and 407 active variants, all with non-empty, unique SKUs; total Nepalgunj on-hand quantity was 1,845 units. Re-read the live state before any future cutover.
- The previous website snapshot contained 13 products, zero variant rows, six products with SKUs and seven without; all 13 were unpublished. None of the six website SKUs matched a BizSathi SKU. These records must not be auto-mapped.
- The Cloudflare Worker has an `INVENTORY_SYNC_SECRET` binding by name. Secret values are intentionally not read or printed. The matching website-side value remains unverified.
- No live stock-changing sync has been run as part of this implementation work.

## Legacy protocol boundaries

- The legacy endpoint acknowledges website quantity deltas and pushes absolute stock values with expected-current-count checks. It is useful only as a manually operated comparison/transition tool, not as the new transactional protocol.
- Acknowledgements represent quantity evidence, not invoices. They cannot establish revenue, tax, customer identity or loyalty points.
- Auraluxe's draft PR #27 implements reserve-first website checkout and POS, blocks legacy stock edits when the authority switch is enabled, and disables website-side restocking in authority mode. It is not merged or activated; verify its latest authorization and recovery fixes before cutover.
- Do not run the legacy absolute-push path for a SKU after it is activated under the transactional protocol. There must be one stock authority and one mutation path.

## Remaining implementation work

1. Add a BizSathi admin workflow for accepting website returns. The service-only return RPC exists, but staff need a controlled receive/inspect/sellable-or-damaged/accept workflow. Restock only after physical receipt.
2. Add admin SKU mapping review, mismatch/exception queue, uncertain-operation recovery, and stock revision visibility. Do not auto-map existing website products.
3. Complete cross-system verification against the Auraluxe PR #27 branch: checkout and POS last-unit races, order commit/cancel retries, lost responses, customer-versus-admin authorization, projection ordering, and return handoff. The Auraluxe change remains draft.
4. Reconcile migration history and obtain fresh recovery evidence before any database migration. Confirm migration sequence across both repositories.
5. Produce a read-only cutover discrepancy report. Re-read the live catalogue and stock, map every orderable SKU one-to-one, reconcile physical stock, and obtain separate approval for baseline mapping and activation.

## Runtime configuration required at cutover

- BizSathi Worker: `WEBSITE_INVENTORY_SYNC_SECRET` (shared server-to-server bearer secret) and `AURALUXE_WEBSITE_INVENTORY_API_URL` (the website projection endpoint).
- Website server: the same `WEBSITE_INVENTORY_SYNC_SECRET` and `BIZSATHI_INVENTORY_API_URL` (the BizSathi reservation endpoint).
- Both database switches remain disabled until mapping and cutover checks are complete: BizSathi `website_inventory_integrations.enabled=false`; website `website_inventory_authority.enabled=false`.
- These names are code requirements only. No production secret values have been read, created, changed, or deployed.

## Production safety boundary

Implementation approval covers Git branches, tests, and reviewable pull requests only. It does not authorize production migrations, secret changes, deployments, stock writes, product publication, test orders or POS sales, baseline sync, or live activation. Those steps remain separately gated.
