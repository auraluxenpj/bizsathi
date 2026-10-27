# Phase 4 — Sales, purchases and POS

## What this phase delivers

- **POS:** product/SKU/barcode search, variant selection, editable quantities, discounts, walk-in or registered customers, credit sales, and cash/bank/digital-wallet/split payments.
- **Sales:** drafts, confirmed invoices, transaction history, printable receipts, and receipt sharing where the device supports it.
- **Purchases:** purchase orders, supplier invoices, goods receiving linked to purchase lines, partial payments, outstanding supplier balances, and purchase returns. Purchase orders alone must not change stock or balances.
- **Returns:** original-invoice-linked sales and purchase returns, controlled refundable quantities/amounts, refunds or credit notes, and preserved original transactions.
- **Cash counters:** cashier sessions, opening cash, recorded cash movements, closing counts, expected cash, and separately recorded reconciliation differences.
- **Overview:** activate only sales, purchases and balances supported by confirmed records; profit and inventory valuation remain unavailable until reliable costing exists.

Use existing business, branch, product, variant, customer/supplier, settings and audit records. Do not create demo businesses or transactions in the live app. No paid payment integration or deployment is included; payment methods record money received/paid, not process online payments.

## Financial and stock safeguards

1. Confirm a document, its stock movements, payment allocations and balanced financial entries in one operation—or save none of them. Calculate totals on the server using precise decimal amounts, with documented per-line rounding and stored price/tax snapshots.
2. Prevent duplicate posting with unique request identifiers; unchanged retries return the original confirmed result. Preserve an interrupted request so it can be checked or retried without creating another sale.
3. Check trusted role and access to every affected branch. Proposed minimums: staff for sales and own cashier activity; accountant for purchase confirmation and payment allocation; administrator for returns/refunds, reversals and reconciliation adjustments. Viewers remain read-only. No role comes from client input.
4. Reject unavailable stock and over-returns. Receiving updates stock once; supplier invoice entry does not receive goods a second time. Transfers and operational postings share concurrency protection.
5. Confirm financial activity only inside an explicitly open business financial period. Period closing and posting must coordinate so a concurrent close cannot admit another entry.
6. Confirmed invoices, payments, returns, journals and ledger movements cannot be overwritten or deleted. Corrections use authorized linked reversals or adjustments, with actor, reason and reference retained.
7. Credit sales require a customer; supplier credit requires a supplier. Enforce payment allocations and refund limits without inventing balances.
8. Read the business’s currency, VAT and fiscal settings. Keep tax treatment configurable; existing defaults are not verified Nepal legal guidance. Do not label receipts as legally compliant until those requirements are validated.

## Implementation order

1. Add the minimum balanced-posting foundation and document/payment contracts needed before enabling financial writes. Full accounting reports and chart-management screens remain Phase 5.
2. Add purchase documents and receiving, then sales/POS and receipts.
3. Add payments, returns/refunds and cashier reconciliation.
4. Connect supported overview totals and run isolation, integrity and interaction checks.

This remains **Phase 4 only**. Offline billing and disconnected-counter synchronization remain Phase 6; an interrupted online request must not be presented as a confirmed sale.

## Verification and remaining dependency

- Run isolated database tests for two-business/branch isolation, every write permission, balanced journals, duplicate retries, closed periods, concurrent stock changes, payment allocation, return limits, and receiving exactly once. Synthetic fixtures must roll back and never reach the live database.
- Run focused calculation tests and browser checks for POS editing, error/retry handling, receipts, and cashier reconciliation across desktop/tablet/mobile layouts.
- Successful live purchase/sale/payment/return confirmation and read-back requires a legitimately registered business, authorized branch, products and an open period. None exists yet; do not fabricate records to claim complete end-to-end verification.
- Existing registration/recovery-email and populated security-review checks remain dependent on legitimate business details and a recipient able to open the mail.

**Credit impact:** high relative to earlier phases, because stock and financial posting must be tested together. Reuse Lovable Cloud and existing packages; add no paid service.

### Technical approach

Use additive Lovable Cloud migrations with explicit least-privilege grants, tenant/branch RLS, restricted database posting functions, immutable confirmed records, and restrictive foreign keys. Reuse authenticated TanStack server functions and the shared workspace navigation. Extend stock posting compatibly without weakening Phase 3 controls. Financial primitives introduced here provide balanced entries and traceable source links, not a complete accounting-reporting module.