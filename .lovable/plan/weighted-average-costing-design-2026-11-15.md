# Weighted-average inventory costing — design and safety contract

Status: design only. No database migration, posting-path change, or report enablement is included in this phase.

## Objective

Implement perpetual moving weighted-average cost per business, branch, and product variant. Keep the existing quantity ledgers as the source of stock quantities and preserve all current commerce, tenant, branch, POS, customer-membership, and loyalty behaviour.

## Core accounting model

For each (business_id, branch_id, variant_id), maintain a cost position:

- quantity_on_hand: exact quantity, reconciled to the existing combined stock balance;
- inventory_value: unrounded carrying value at configured database precision;
- average_unit_cost = inventory_value / quantity_on_hand when quantity is positive;
- valuation_status: valued, unvalued, or blocked/reconciliation-required.

A confirmed stock-affecting posting appends an immutable cost event in the same database transaction as its existing quantity posting. Cost events retain the source document/line or stock operation, branch, variant, signed quantity, signed carrying value, unit cost snapshot where relevant, event date, and origin references. Any cached position is a rebuildable projection, never the sole audit evidence.

Use exact decimal arithmetic and sufficient numeric scale for unit costs and carrying values. Do not round unit cost after every movement. Round only at financial/reporting boundaries under the existing NPR currency policy. No floating-point JavaScript arithmetic for posting values.

## Event treatment

| Existing event | Cost treatment |
|---|---|
| Purchase bill | No inventory value change by itself; it is commercial evidence until receipt |
| Goods receipt linked to purchase | Increase quantity and inventory value using the source purchase line's net unit cost (line discount allocated proportionally); receipt is the cost-entry point |
| Sale | Reduce quantity and carrying value at the branch's moving average immediately before the sale; persist the exact COGS/unit-cost snapshot against the sale line |
| Purchase return | Reduce quantity and carrying value using the original linked receipt's recorded unit cost, not today's average; reject if source receipt provenance is absent or branch stock would become negative |
| Sales return | Increase quantity and carrying value using the original sale line's recorded COGS unit cost; do not use the current average |
| Opening stock | Require an explicitly approved unit cost and effective date for each branch/variant; no silent use of catalogue purchase_price |
| Positive adjustment / found stock | Require explicit administrator-approved unit cost and reason; mark unvalued or block financial valuation if no supported cost is supplied |
| Negative adjustment / disposal | Reduce quantity and value at the branch's current moving average; preserve the existing reason and actor evidence |
| Branch transfer | Remove quantity and carrying value at source branch average; add the exact same carrying value to destination branch, producing a new destination average |
| Website stock acknowledgement | Quantity-only evidence today; must be costed as an authorized adjustment at the affected branch's average for decreases, and source-sale-cost evidence is required for returns before it can affect financial costing |

Purchase and receipt dates may differ. The effective costing sequence must follow actual posting/receipt chronology, not bill creation alone. Backdated postings that would change later average costs require deterministic replay/recalculation under the same business lock or must be rejected until controlled backdated-cost handling exists.

## Missing provenance and negative stock

- Never substitute variant.purchase_price, last purchase price, selling price, or zero as a missing cost.
- A branch/variant with uncosted opening stock or an uncosted positive movement is unvalued. Profit and inventory valuation remain unavailable for any reporting scope that includes unresolved balances or affected sales.
- Do not allow a sale to consume unvalued stock and then claim a fully valued COGS result.
- Existing nonnegative quantity checks remain authoritative. A posting that would create negative quantity or negative inventory value is rejected.
- A source-linked return must be limited to the original line's remaining returnable quantity and must reverse its original cost evidence.
- Costing corrections are append-only reversal/replacement events with administrator attribution; never edit or delete historical events.

## Concurrency, tenancy, and transaction boundary

Extend the existing protected commerce/stock RPCs; do not add a second client-side posting path. Cost and quantity events must commit or roll back together. Reuse business advisory locking and open-period validation, and lock the affected branch/variant cost position in deterministic order. Verify role and branch access inside the SECURITY DEFINER RPC. Preserve request idempotency and source-document validation. Every new table must have business_id, restrictive foreign keys, RLS, tenant/branch-scoped read policies, immutable event triggers, and audit evidence. Never cascade-delete financial or posted records.

## Repository and posting audit — 2026-11-15

- The app maintains two append-only quantity ledgers: `stock_movements` for manual operations and `commerce_stock_movements` for confirmed commerce documents. The report snapshot combines them for quantity only; neither ledger contains unit cost or carrying value.
- Manual opening stock, adjustments, and branch transfers post through the protected stock operation RPC. Commerce confirmation posts sale, goods receipt, sale return, and purchase return quantity movements. A purchase bill alone does not receive stock.
- Goods receipt lines are copied from the linked purchase line with proportional discount allocation. This is usable source evidence for receipt unit cost, but the current movement row does not preserve a cost snapshot.
- Sales currently reduce quantity without recording COGS. Sales returns restore quantity without a cost snapshot. Purchase returns are source-linked and quantity-limited, but need the original receipt-cost evidence in the new cost ledger.
- Website stock acknowledgements currently call the manual adjustment operation. A decrease can be costed at the affected branch average; a positive acknowledgement/return has no linked original sale-cost evidence and must remain unvalued or be blocked until supported provenance is supplied.
- `costOfGoods` in `src/lib/business-reports.ts` is a legacy helper that estimates from the latest purchase price and optional catalogue fallback. It is not used by the current report builder; do not reuse it for financial reporting. The report builder keeps valuation and Profit & Loss unavailable.
- Migration files `0033`–`0040` are intentionally unregistered, as documented in `supabase/ROLLBACK_AND_SECURITY.md`; the verified Drizzle journal ends at `0032` and registers `0041` separately. Do not replay the unregistered files or infer their live application status from their presence in Git. `drizzle/schema.ts` is intentionally blank, and `supabase/config.toml` alone does not prove the live database identity.
- No live database connection, applied migration ledger, or production schema read-back is available in this workflow. Migration application remains blocked until the actual BizSathi database identity and its migration ledger are verified.

## Historical reconciliation before activation

1. Verify the actual BizSathi database project identity and its applied migration ledger; do not assume repository migration files or the configured project ID establish live state.
2. Inventory every branch/variant's current quantity from both quantity ledgers.
3. Reconcile historical confirmed purchases to goods receipts, returns, sales, sale returns, manual openings/adjustments, and transfers.
4. Collect approved opening costs and missing receipt/return provenance from the business.
5. Replay events in effective chronological order in a dry-run and compare calculated quantity to the existing stock balance for every branch/variant.
6. Produce a reconciliation report listing quantity mismatches, missing costs, duplicate or orphan source lines, and negative intermediate balances.
7. Enable costing only after an administrator approves the reconciliation. Keep valuation and Profit & Loss unavailable until all included branches/items are fully valued and expense classifications are validated.

## Required tests

- Weighted average: receive 10 @ 100, then 10 @ 200 gives 20 units and value 3,000, average 150.
- Issue 4 at average 150 leaves 16 units and value 2,400.
- A subsequent receipt changes the average using remaining value plus new receipt value.
- Purchase discount is allocated consistently and VAT is excluded from inventory cost unless policy explicitly establishes a recoverable/nonrecoverable tax treatment.
- Purchase return reverses the original receipt unit cost even after later receipts change the average.
- Sales return restores the original sale COGS even after later purchases.
- Transfer carries exactly the source carrying value into the destination branch.
- Positive adjustment without approved cost blocks valuation; negative disposal uses current average.
- Missing opening cost, unvalued stock, negative intermediate stock, duplicate requests, backdated postings, and source-link mismatches fail safely.
- Concurrent receipt/sale/transfer requests serialize correctly.
- Tenant and branch isolation, retry idempotency, immutable events, and full quantity tie-out.
- Regression coverage for POS, offline draft confirmation, purchase orders, receipts, returns, memberships, reward points, and website stock sync.

## Delivery gates

Phase A: this design and pure calculation tests.
Phase B: verified database/migration audit and non-destructive reconciliation tooling.
Phase C: append-only cost-event schema and atomic posting integration after migration history is verified.
Phase D: historical replay, administrator sign-off, and report activation only when fully valued.

No production deployment is part of these phases unless explicitly requested.
