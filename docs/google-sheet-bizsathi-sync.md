# Auraluxe Google Sheets → BizSathi sync (implementation notes)

## Safety boundary

The sync must be manual and approval-gated. Fetching and comparing source data is read-only. A later commit action must require explicit approval of the exact comparison snapshot and must reject a stale snapshot.

This first implementation slice adds only the deterministic, read-only comparison planner in `src/lib/google-sheet-sync-plan.ts`. It does not connect a new write path, execute a migration, import stock, alter existing records, or enable any integration.

## Identity and product rules

- SKU is the only matching key. Matching is case-sensitive after trimming surrounding whitespace.
- Model Code is descriptive metadata only; it is never used to find or join products.
- A SKU is immutable during a matched update.
- Duplicate or blank SKUs block the affected row; the planner does not guess.
- Existing BizSathi SKUs absent from Master are reported as extras and are not deactivated.
- Three explicitly excluded SKUs are filtered out before previews and reports are built. No row details for them are returned.
- Product field updates and the opening-stock baseline are separate plan sections. The planner does not apply either.

## Stock and transaction rules for the next slice

- Master Qty is a one-time opening baseline and must be separately reconciled and approved against the real combined BizSathi stock balance before any stock movement is posted.
- Stock In rows must be posted idempotently by receipt ID. Existing receipt IDs must be detected and not replayed.
- BizSathi stock movement reporting must export immutable events from both `stock_movements` and `commerce_stock_movements`, with append-only event IDs in the managed Google Sheets movement tab.
- The Google Sheet is not allowed to write exported movements back into BizSathi.
- No website sync or website catalogue activation is in scope.

## Not yet implemented

The review UI, persisted snapshot/approval record, transactional server-side commit, one-time stock baseline reconciliation, Stock In approval path, and append-only outbound movement exporter are intentionally not part of this foundation commit. They must be added only after validating the combined stock balance semantics and the live source tables/functions. Existing legacy import and website-sync actions must not be reused for this workflow.


## Read-only production audit (23 Nov 2026)

The current Auraluxe BizSathi ledger was inspected with the three excluded SKUs omitted from all queries:

- 404 in-scope active variants were found.
- Every one of those 404 variants already has exactly one `stock_movements` row of kind `adjustment`.
- Those adjustment rows total 1,821 units.
- One additional `receive` movement exists, for 1 unit.
- The combined current balance across the four tables used by `commerce_stock_balance` is 1,822 units across 404 SKUs; all 404 balances are positive.
- No commerce-stock or website stock movement rows were returned in the in-scope movement audit.

**Important consequence:** the 1,821-unit Master baseline must not be posted as another stock adjustment or opening-stock import. It appears already represented in BizSathi's 404 adjustment rows at aggregate level. Before any future reconciliation, compare Master Qty to the existing per-SKU balances; aggregate equality alone is not proof that each SKU agrees. If the per-SKU values agree, baseline reconciliation is a no-op.

The live stock-balance function sums `stock_movements`, `commerce_stock_movements`, `website_inventory_movements`, and `website_inventory_return_movements`. A future movement exporter must preserve immutable IDs and include all four source tables, even though only the legacy adjustment/receipt table currently contains in-scope rows.
