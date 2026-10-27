# Phase 4 verification and recovery

## Delivered

Protected POS, sales and purchase documents, goods receiving, source-linked returns, recorded cash/bank/wallet payments, cashier events, printable/shareable receipts, financial-period creation and VAT configuration. Business data is reused; no live sample transactions were inserted. Financial entries use minimal periodic purchase accounts, not inventory valuation or COGS. Profit and inventory value remain unavailable.

## Posting boundaries

- All writes use authenticated restricted database functions; staff may confirm sales and their own sale payments/counters, accountants handle purchases and allocations, administrators handle returns/refunds and cash adjustments. Trusted rank helpers include owners.
- A business advisory lock coordinates commerce and legacy stock posting. Open financial period rows are held with a shared lock; closing requires a conflicting row lock.
- Document, stock, financial entries and embedded payments commit atomically. Deferred journal checks reject imbalance; all operational records are immutable and audited. No authenticated direct write/delete grants exist.
- Purchase invoice entry does not receive stock. A source-linked goods receipt does; receipts and returns enforce source quantity limits. Legacy/manual and commerce movement quantities are combined on reads and availability checks.
- Refunds may not exceed settled return credit. Named-party returns can retain a credit obligation in the receivable/payable journal; walk-in returns require a full immediate refund. Corrections preserve the original invoice.
- Browser confirmation retains the online document request by user/business in session storage for unchanged retries and exact-ID status checks. This is not offline POS; tab storage loss and full device recovery remain Phase 6 considerations. Payment/counter retry IDs remain in their current form; inspect history before restarting interrupted activity after leaving that page.
- VAT comes from business settings or zero-rated lines. Legal compliance, BS receipt date conversion, costing and the complete chart/report suite are not claimed.

## Executed checks

The isolated PostgreSQL harness applied migrations 0006–0012. `supabase/tests/commerce_isolation.sql` reached its deliberate `COMMERCE ISOLATION TESTS PASSED` rollback marker: invoices post once, stock deducts/restocks correctly, goods receive once, overpayment/overreturn/unsettled refund are denied, journals balance, closed periods deny posting, staff/viewer/tenant boundaries hold, and cash counts record a distinct variance. The existing inventory and tenant suites must also pass after commerce integration. Unit tests check line rounding, decimal totals and record-based dashboard sums.

Browser checks confirmed signed-in trading pages and signed-out guards without page errors, and no horizontal overflow at 799×732. A legitimate business now exists, but has no branches, products or periods; successful live confirmation/read-back cannot be exercised without those real prerequisites. No synthetic live data may be created to remove that limitation. Real receipt printing/sharing, refunds and cashier confirmation still need live end-to-end review. High-volume load and adversarial concurrent posting require further review before production use.

## Recovery

Changes are additive. If posting is unavailable, stop new confirmations and preserve documents, movements, payments, journal entries and audit events. Retry exactly the same request identifier/payload after checking its status; never recreate a sale to work around uncertainty. Correct confirmed sales/purchases through linked returns/credit notes, not updates or deletion. Cash count differences are evidence, not automatic adjustment approvals. Full payment reversal and reconciliation-variance resolution workflows are not included in this initial Phase 4 delivery.