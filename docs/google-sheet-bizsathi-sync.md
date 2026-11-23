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
