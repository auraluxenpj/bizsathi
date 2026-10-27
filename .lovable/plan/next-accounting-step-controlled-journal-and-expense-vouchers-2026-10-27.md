# Next accounting step — controlled journal and expense vouchers

## Review findings

- The existing journal already enforces balanced, immutable postings and trusted business/branch access. Reuse it rather than introducing another ledger.
- Manual journal/expense entry is missing. The journal currently permits only ten operational accounts; controlled expense accounts and voucher evidence are needed.
- Existing reports identify documents, payments and cash-counter sources, but not manual vouchers. Account totals must include new accounts rather than silently omitting them.
- Live inspection still shows one business, no branches, no financial periods and no journal activity. Successful live posting and populated-report checks remain blocked; no sample business transactions were created.

## Deliver this increment

1. Add **Journal vouchers** and **Expenses** to the accounting workspace, with business, authorized branch, open financial period, date, reference and reason.
2. Journal entry uses multiple debit/credit lines and exact NPR amounts. Expense entry selects a controlled expense category and bank or digital-wallet payment account; it creates the matching balanced entry automatically. Cash expenses are excluded until counter reconciliation integration is reviewed.
3. Extend the existing account allowlist with a small explicit set of expense accounts (rent, utilities and general operating expenses). This is not yet a fully customizable chart of accounts.
4. Limit manual posting to these expense accounts and bank/wallet accounts. Do not permit manual changes to receivables/payables, VAT, sales, purchases, inventory or counter-clearing accounts: these could contradict invoices, tax, stock or cash-counter evidence.
5. Accountants, administrators and owners may post within their authorized branches; staff/viewers cannot. All restrictions apply in the database, not just the screen.
6. Add a confirmation review before posting, immutable voucher history, actor attribution and balanced posting evidence. Failed requests leave no partial voucher or journal rows.
7. Preserve a stable retry identifier and unchanged request until its result is checked or confirmed; reject conflicting reuse. This remains online-only, not offline billing.
8. Add administrator-authorized **full reversal of these new vouchers only**, requiring a reason and an open period on or after the original date. Reverse the original lines exactly once, retain both entries and their link, and never edit or delete posted history. Existing invoice/payment/counter corrections remain untouched.
9. Integrate voucher references, expense accounts, reversals and detail evidence into the existing ledger, recorded trial balance and cash/bank/wallet reports; add an expense register with date/branch filters and spreadsheet-safe export. Reports remain recorded activity, not reconciled full statements.

## Safeguards and verification

- Reuse the shared business posting lock, open-period lock, trusted roles, branch helper, balance trigger and audit mechanism.
- Test exact balance, expense account restrictions, role/tenant/branch denial, invalid dates/closed periods, unchanged retries, conflicting identifiers, rollback on failure, immutable history, full reversal signs and duplicate-reversal denial.
- Test that new account totals and voucher/expense/reversal evidence appear in reports without changing legacy sales, stock or payment behavior.
- Run existing unit and isolated tenant/inventory/commerce/report suites. Synthetic records remain only in the disposable test database.
- Check signed-in forms, confirmation/error states and tablet layout. Successful live voucher save, reversal, populated evidence and exports require legitimate branches and an open period; report them as unverified if still absent.
- No deployment, paid integration, destructive migration or AURALUXE changes. Credit impact: medium–high because financial write controls require additional validation.

## Still outside this step

Controlled opening balances need a cutover-date and prior-activity policy. Custom chart management, cash expenses, payment reversals, cash-difference resolution, attachments/recurring expenses, inventory costing/COGS, profit/loss, full balance sheet, classified cash flow and offline POS remain separate steps. Do not claim Phase 5 complete.

## Technical approach

Use additive voucher metadata with tenant/branch RLS, explicit revoked default grants and least-privilege reads. No direct authenticated financial writes. Restricted posting/reversal operations write the existing `commerce_journal_entries` atomically, with source identifiers isolated from legacy sources and immutable audit evidence. Broaden the existing account constraint only for the named expense codes while keeping legacy codes valid. Extend the existing read snapshot and server-side Decimal aggregation, maintaining numeric-text transport and totals before pagination. Use authenticated TanStack server functions and the existing app controls; no new backend or parallel ledger.