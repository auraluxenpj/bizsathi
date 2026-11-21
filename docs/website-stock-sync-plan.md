# Auraluxe website inventory integration

## Implementation status

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
- The existing website checkout, POS, admin inventory and restock functions still write website stock columns. They must be migrated to the BizSathi reservation/ledger path or safely disabled for activated mappings before cutover.
- Do not run the legacy absolute-push path for a SKU after it is activated under the transactional protocol. There must be one stock authority and one mutation path.

## Required implementation work

1. Add a BizSathi integration identity and reviewed one-to-one SKU mapping registry scoped to the Auraluxe business and Nepalgunj branch.
2. Add atomic BizSathi reservation, commit, cancellation, accepted-return, receipt and correction operations, with immutable operation evidence and service-to-service authorization.
3. Add a durable transactional outbox and movement cursor/revision. Cursor semantics must be commit-ordered or use a safe overlap/acknowledgement protocol.
4. Add the authenticated versioned API and durable retry/reconciliation worker. A lost response must be resolved by the original operation ID.
5. Change website checkout to reserve before order acceptance; preserve guest checkout and payment lifecycle. Replace website-side stock decrements/restocks with idempotent calls and explicit pending states.
6. Route BizSathi POS and every other stock writer through the same ledger and publication outbox. Offline drafts must not reserve or deduct.
7. Add admin mapping review, mismatch queue, uncertain-operation recovery, and stock revision visibility.
8. Test concurrent last-unit checkout, checkout vs POS race, duplicate requests, lost responses, cancellation, partial returns, webhook replay, SKU mismatch, stale publication, authorization and branch isolation.
9. Reconcile migration history and obtain fresh recovery evidence before any database migration.
10. Produce a read-only cutover discrepancy report. Baseline mapping and live activation require separate explicit owner approval.

## Production safety boundary

Implementation approval covers Git branches, tests, and reviewable pull requests only. It does not authorize production migrations, secret changes, deployments, stock writes, product publication, test orders or POS sales, baseline sync, or live activation. Those steps remain separately gated.
