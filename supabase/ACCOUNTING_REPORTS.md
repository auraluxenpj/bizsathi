# Phase 5: recorded-activity accounting reports

## Delivered and boundaries

The operational-report expansion adds posting-user controls, stock/low-stock reports, dedicated party/balance views and full print/CSV context. See `BUSINESS_REPORTS.md` for current coverage, filter semantics and remaining financial-statement prerequisites. Earlier verification below describes the original increment, not the expanded suite.

`/accounting` reads the existing commerce ledger; it does not create another ledger or change posting contracts. Available views: posting accounts, general ledger, recorded trial balance, sales/purchase registers, party control-account statements, invoice-family outstanding balances, cash/bank/wallet books and configured VAT postings. Business, authorized branch, date range, financial-period date selection, account and party filters are available. Detail pages contain 50 rows; CSV exports contain every matching row, use formula escaping and include source identifiers. Print is explicitly the displayed page, not a complete multi-page export.

Amounts are transported as numeric text and aggregated with Decimal.js server-side. Opening balances are prior recorded postings, **not** an established opening-balance voucher. Closing account columns split positive/negative debit-minus-credit totals. Statements carry separate receivable/payable running totals; they are not a single customer-supplier netting approval. Registers sign returns negatively. Outstanding balances combine each original invoice, its linked returns, original payments and return refunds exactly once, as at the end date, independent of start date. Negative amounts are credits; invoice age is not overdue age because due dates are not present.

Controlled bank/wallet and expense journal vouchers, voucher-only full reversals and an expense register are now available. No complete configurable chart, opening-balance workflow, payment reversal, cash-variance resolution, COGS, stock valuation, profit/loss, full balance sheet or classified cash-flow statement is claimed. VAT summaries are configured posting evidence, not certified Nepal tax filings. Cash/bank totals are not externally reconciled balances. Full Phase 5 remains incomplete.

## Access and consistency

Migrations 0013–0014 add a read-only, security-invoker snapshot function. It verifies authenticated membership and an explicitly requested branch, then reads under existing tenant/branch RLS. Anonymous execution is revoked; authenticated/service execution is explicit. A single statement captures journals, confirmed document/payment evidence and authorized selectors without default REST row truncation. Raw requests and product lines are excluded. Report totals are computed before pagination. There are no live synthetic records and no changes to operational financial writes.

All-history JSON snapshots can become costly for very large businesses: volume/load testing and dedicated database aggregation/keyset detail should precede high-volume production reporting. Failure is surfaced rather than substituting partial or invented totals.

## Verification

- 39 existing/new unit and routing tests passed, including nine accounting calculation/validation tests: concrete opening/range/closing values, decimal precision, tenant/branch scope, returns/payments/refunds, draft exclusion, party attribution, pagination-independent totals and valid date boundaries.
- `supabase/tests/accounting_isolation.sql` passed in the disposable local PostgreSQL environment. It creates actual postings via the existing restricted operations inside a rollback transaction and checks confirmed evidence, numeric-text transport, date/branch filters, cross-tenant denial, viewer branch visibility and anonymous denial. The first run detected SQL projection precedence retaining requests; migration 0014 corrected it and the rerun passed.
- Existing commerce, inventory, tenant and business-access SQL suites were rerun in that isolated database and reached their deliberate rollback success markers after the reporting changes.
- Browser checks exercised signed-out redirect, signed-in real-account report loading, VAT/general-ledger selection, invalid date range and 799×732 layout without page errors or horizontal overflow. This account has no posted activity: populated UI, posting evidence, CSV and print read-back through live financial data remain **unverified**, not inferred from empty pages.

## Recovery

Stop report use if totals or attribution appear incorrect; preserve source documents, payments and ledger rows. Disable the report surface rather than editing posted history. Corrections to report logic/functions should remain additive and read-only. Do not repost a transaction to fix a report or treat a report discrepancy as approval for a cash adjustment. Existing Phase 4 correction and period controls remain unchanged.