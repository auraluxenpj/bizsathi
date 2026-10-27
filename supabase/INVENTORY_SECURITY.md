# Phase 3 inventory security and recovery

- Product variants and customers/suppliers are business-scoped; active members may read and administrators may create/edit. No authenticated delete grants are present. Variant deactivation preserves references.
- Stock is an append-only quantity ledger, not an accounting valuation. Opening stock and adjustments require administrator rank; receiving and transfers require staff rank or higher and branch authorization. A transfer requires both branches, preserves total quantity, and cannot overdraw stock.
- `post_stock_operation` verifies trusted permissions, serializes by business with a transaction advisory lock, validates active references, and writes the operation plus all movements atomically. An identical request UUID by the same actor returns the original result; changed payloads are rejected. `post_stock_request` is an invoker wrapper to represent nullable destination values accurately.
- Reasons/references and actor attribution are retained. Opening stock precedes other movements and occurs once per branch/variant. Corrections append adjustments; never edit/delete history.
- CSV product imports validate before a single atomic RPC; duplicate SKUs, barcodes or variants roll back the entire import. Exports escape spreadsheet formula cells. No sample business records were inserted.

## Executed verification

Apply migrations `0004` and `0005` after `0000`–`0003` in the disposable PostgreSQL harness described in `ROLLBACK_AND_SECURITY.md`. Run `supabase/tests/inventory_isolation.sql` as its privileged fixture user. Expected final marker: `INVENTORY ISOLATION TESTS PASSED`; its deliberate exception rolls back fixtures. This test was executed successfully during Phase 3 and verifies retry safety, atomic imports/transfers, negative-stock denial, cross-business/branch isolation and operation permissions.

23 focused unit/routing tests passed. Signed-in pages and signed-out guards were browser checked without page errors. Successful live product/contact saves and movement read-back remain unverified because no legitimate business/branch exists. Do not insert synthetic live records to bypass this limitation.

## Recovery and remaining scope

All schema changes are additive. Disable affected navigation/writes or roll application code back if needed; retain stock operations, movements and audits. Correct errors with authorized, referenced adjustments. For an uncertain connection outcome, retry the exact request or check its reference in the ledger before starting another request.

Before high-volume production use, review the business-wide serialization and complete concurrent posting/load tests, durable recovery of interrupted browser requests, and full end-to-end checks using legitimate records. Stock valuation, brands/costing, structured physical-count documents, sales deductions/returns, purchase-document linkage and balanced accounting posting are not implemented here; operational posting arrives in later phases. Current receiving is a standalone quantity operation with a required reference, not a posted purchase or accounting entry.