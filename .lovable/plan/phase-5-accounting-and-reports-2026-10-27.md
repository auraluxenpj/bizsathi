# Phase 5 — Accounting and reports

## Readiness review

- Existing sales, purchases, payments and cash-counter activity already create protected, balanced journal postings. Reuse these records and their business/branch permissions.
- Live inspection found 21 public tables with row-level security enabled, one business, and no branches, products, financial periods, journal postings or payments. No live sample records were added.
- A complete chart of accounts, opening balances, general journal vouchers, payment reversals, inventory costing and COGS are not implemented. Balanced operational postings alone do not establish complete financial statements.
- Phase 4 successful live transaction checks and cash-difference resolution remain outstanding. Earlier test results are historical; this review did not rerun them.

## First accounting increment — approval requested

Build a read-only **Accounting & Reports** workspace without changing existing financial posting workflows:

1. Show the existing posting accounts and their recorded debit/credit totals, with an explicit distinction between recorded activity and complete/reconciled business balances.
2. Add a general ledger and recorded-postings trial balance, linked to source documents or payment evidence. Explain incomplete opening balances through report status, not fabricated amounts.
3. Add sales/purchase registers, customer/supplier statements and outstanding document balances. Include returns, credits and partial payments; do not assume a journal row contains party attribution.
4. Add cash/bank/wallet transaction books and configured VAT posting summaries. These are recorded-activity summaries, not bank reconciliation, statutory filings or certified tax reports.
5. Support authorized business/branch selection, date ranges, financial-period selection, paginated detail, print and spreadsheet-safe CSV exports. Ledger and trial-balance opening totals must include permitted postings before the selected start date; document registers cover activity within the range.
6. Keep profit, stock valuation and full balance-sheet/cash-flow statements unavailable until their missing accounting inputs and rules are implemented and validated. Do not label invoice age as overdue without a supported due date.

This is the first Phase 5 increment, **not completion of the full accounting phase**. Offline POS remains Phase 6.

## Verification and safeguards

- Test concrete debit/credit balance, opening/range/closing calculations, return and payment treatment, draft exclusion, party attribution, exact date boundaries and tenant/branch isolation using synthetic records only in an isolated test environment.
- Verify signed-in navigation, filters, report detail and exports; never treat an empty screen as verification of populated reports.
- Successful live financial read-back remains blocked until legitimate branches, periods and transactions exist. Do not manufacture them.
- Preserve immutable records, existing permissions and posting locks. No destructive schema changes, paid service, automatic deployment or AURALUXE changes.
- Document report limitations and recovery. Credit impact: medium for this reporting increment; high for the remaining accounting controls and valuation work.

## Later Phase 5 gates — separate approval

Extend the chart of accounts and add audited opening balances, expense/general-journal vouchers, authorized reversal controls, payment corrections and cash-difference resolution through balanced, idempotent operations with closed-period protection. Define and validate a costing/COGS approach before inventory valuation, profit/loss or a full balance sheet; define cash-flow classifications before a cash-flow statement. Preserve legacy postings rather than rewriting history.

## Technical approach

Reuse the existing TanStack app, shared navigation, Decimal.js calculations, authenticated server functions, tenant/branch RLS, commerce journals and existing exports. Aggregate complete authorized source data server-side; never total only the visible page. Use narrowly scoped additive database functions only when required for accurate aggregation, with trusted membership checks and least-privilege execution grants. Keep the legacy journal as the single source for this increment; do not introduce a parallel ledger or duplicate posting.