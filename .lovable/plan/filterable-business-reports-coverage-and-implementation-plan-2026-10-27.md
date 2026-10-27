# Filterable business reports — coverage and implementation plan

## Audit findings

Existing reports already include date ranges, authorized branches, financial-period date selection and full-result CSV export. User filtering is missing. Stock and low-stock reporting is separate from accounting and lacks the same filtering/export controls. Printing currently includes only the displayed page.

The stock ledger records quantities, not costs. The accounting chart does not yet establish inventory/COGS, opening balances or complete financial-statement classifications. Therefore sales minus purchases cannot truthfully be called profit, and current selling prices cannot be used as inventory value.

## First increment for approval

Extend the existing reports, not create a competing reporting ledger. Make the available operational reports consistent and filterable, and explicitly distinguish the four reports that need further accounting work.

| Requested report | Result in this increment |
| --- | --- |
| Sales and profit | Confirmed sales, returns, net sales and tax; profit clearly unavailable until reliable costing/COGS exists. |
| Purchases | Confirmed purchase/return register, signed totals and source evidence. |
| Inventory valuation | Explicit unavailable status; no invented valuation or selling-price estimate. |
| Stock movement | Combined legacy and invoice-linked quantity ledger with date, branch, posting-user filters and export. |
| Low stock | Authorized branch stock as of the end date, thresholds and quantities with CSV/full print. User filter does not change whole-branch stock balances. |
| Customer ledger | Dedicated customer selection and receivable ledger with recorded opening/running balances. |
| Supplier ledger | Dedicated supplier selection and payable ledger with recorded opening/running balances. |
| Receivables and payables | Separate views of invoice-family balances as of the end date, incorporating linked payments, returns and refunds. |
| Expenses | Expense postings and voucher reversals with posting-user/date/branch filters. |
| Cash and bank | Cash/bank/wallet movement books, opening and closing recorded balances, clearly not externally reconciled. |
| Trial balance | Exact recorded opening, date-range debit/credit and closing amounts with difference checks. |
| Profit and loss | Explicit unavailable status pending COGS and complete expense/account classification. |
| Balance sheet | Explicit unavailable status pending established openings and complete assets/liabilities/equity accounts. |
| Cash flow | Recorded cash movement summary can be exported; a classified cash-flow statement remains unavailable pending reliable classifications. |
| Tax summaries | Configured VAT input/output postings and sales/purchase VAT evidence, not a certified Nepal filing. |

### Common controls

- Date range, authorized branch, user and report-specific account/party selections, with reset-on-business-change behavior.
- Expose only users attributable to evidence the caller can access; no global user directory or another business's staff list. Use authorized display names where available, with immutable user identifiers for attribution.
- Define user filtering as **posted by** for activity registers, movement reports and selected journal activity. Make clear when a resulting ledger is a user's posting subset, not the business's complete balance.
- For receivables/payables, a user selection chooses the original invoice creator but still incorporates every authorized linked payment, refund and return. For low-stock/as-of balances and whole-business trial balance, disable the user filter rather than silently excluding other users' movements. These balances must remain complete within the authorized branch scope.
- Stock movement dates use the recorded posting timestamp in business timezone; financial reports use their document/journal dates. Low stock and outstanding balances are **as of the end date**; the start date does not erase earlier history.
- CSV exports include every matching row, filter context, source identifiers and formula escaping. Add a complete print view using the same full-result data, suitable for browser Save as PDF. Keep screen pagination separate from export totals.
- Preserve accounting voucher forms and existing ordinary POS, inventory, report and security flows.

## Subsequent financial prerequisites — not included in this approval

Complete valuation, profit/P&L, balance sheet and classified cash-flow statements need a separate reviewed accounting increment:

1. Choose and approve a costing method and obtain legitimate opening stock costs and purchase receipt costs. Define invoice/receipt separation, returns, transfers, damage, discounts and backdated corrections.
2. Establish audited inventory-value and COGS posting without rewriting existing posted history or pretending historical costs are known.
3. Establish opening balances and extend the controlled chart with account classifications for assets, liabilities, equity, income and expenses.
4. Define cash-flow classification and inter-account transfer treatment; surface reconciliation/completeness gaps.
5. Verify statements against legitimate balances and controlled posting fixtures before enabling them as complete financial statements.

No unverified tax rate, statutory format, fabricated live record or assumed historical cost will be introduced. These prerequisites remain open rather than marking the whole requested suite complete.

## Technical approach

Reuse the existing invoker-RLS accounting snapshot, authenticated server functions, Decimal.js calculations and formula-safe CSV utilities. Preserve actor IDs currently dropped by report parsing, and extend read-only projections only where needed for authorized selectors and stock evidence. Combine both quantity ledgers without duplicating movements. Calculate totals and as-of balances before pagination. Do not use administrator bypass clients for ordinary report reads, add a parallel ledger, or modify financial posting contracts.

Any database changes will be additive read-only function updates with explicit execution privileges and existing tenant/branch authorization. No new tenant tables are expected. Evaluate snapshot size; do not silently truncate large result sets or promise high-volume performance without testing.

## Verification and stopping point

- Tests for inclusive date boundaries, business timezone boundaries, creator-versus-payment-user attribution, branch/tenant isolation, complete linked settlement totals, as-of low stock, return/reversal signs and exact decimals.
- Tests proving filtered totals do not change with pagination and exports use the full matching result.
- Isolated database tests for stock/actor projections, authorized user visibility and denied tenant/branch/anonymous access; rerun existing accounting, commerce, inventory and voucher tests.
- Browser checks for report/filter selection, invalid dates, user-filter eligibility, CSV/full print and layouts. Populated live export/read-back requires legitimate activity; no synthetic live records will be inserted to remove this limitation.
- Record remaining costing/statements and live-verification blockers in the roadmap and report documentation. Stop for review after this operational-report increment.

Expected credit impact: medium–high for expanded reporting and adversarial verification; completing costing and financial statements later is a separate high-impact increment. No paid integration or deployment is included.