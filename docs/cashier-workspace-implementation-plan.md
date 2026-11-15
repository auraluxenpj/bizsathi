# Cashier workspace implementation plan

## Goal

Give branch-scoped cashiers a focused workspace for counter operations while preserving the existing commerce ledger, POS, inventory, memberships, and accounting records. This is an additive plan; it does not authorize production database changes or deployment.

## Confirmed product decisions

- Cashier access is delegated by a manager and limited to the assigned branch.
- A cashier can open and close their own cash session, enter denomination counts, create sales, and view their own sales and shift summary.
- Every sale return is a request first. A manager with the required branch authority must approve it before the return document, stock reversal, or refund is posted.
- A cashier must not approve their own return request. The approval actor and decision are auditable.
- Refunds are linked to the original sale/approved return and the cashier's active cash session when paid in cash.
- Managers and the owner can review all authorized branch sessions and cashier reports.

## Existing foundations found in main

- `src/components/cash-counters.tsx` already supports open/close events, denomination counting, cash-in/out UI for manager roles, daily closing reports, and CSV export.
- `post_cash_counter_event` in migration `0008_commerce_counter_and_stock_guards.sql` binds counter events to the authenticated actor and branch. It currently permits cash-in/out only to admin-level roles.
- `src/components/pos.tsx` is the existing POS; the current billing-staff redirect is in `src/components/app-navigation.tsx`.
- `src/components/trading-documents.tsx` creates sales and returns. Currently, return creation is manager-only, and return refunds are recorded through the payment flow.
- Existing `cash_counter_events`, `commerce_documents`, and `commerce_payments` are immutable/ledger-oriented. Do not edit or delete posted records to implement approval.

## Phased implementation

### Phase 0 — security and workflow contract

1. Define an additive return-approval request record with business, branch, source sale, requested items/quantities, reason, requested-by, status, reviewer, decision timestamp, and immutable decision history.
2. Enforce access in database RPCs, not only hidden UI:
   - cashier can create a request only for an eligible confirmed sale in an assigned branch;
   - request quantities cannot exceed remaining returnable quantities, accounting for approved/posted returns and other pending requests;
   - manager must have approval authority for that branch;
   - requester cannot approve their own request;
   - approve/reject is atomic and idempotent;
   - approval revalidates source sale, stock/period constraints and outstanding refund limits before posting.
3. Pending requests must reserve quantities to prevent duplicate/overlapping requests.
4. Do not post stock movements, a sale-return document, journal entries, or refunds until approval.
5. Record rejection reason and preserve the request for audit.

### Phase 1 — cashier workspace

- Add a focused Cashier entry/tab for assigned cashiers.
- Show shift state prominently: closed / open, branch, opening float, and today's totals.
- Actions: open shift, POS sale, sales history, request return, cash close.
- Restrict cashier views to their own sessions and sales unless a manager view is explicitly selected.
- Keep manager-only cash-in/out and sensitive financial figures unavailable to cashiers.
- Reuse existing POS, counter and invoice components rather than duplicating transaction logic.

### Phase 2 — return approval queue

- Manager queue filtered by assigned branch, with original invoice, requested items, quantities, reason, prior returns and refundable balance.
- Approve or reject with required audit trail.
- On approval, post the return through the existing commerce posting contract and permit refund only up to the validated refundable amount.
- Cash refund must be associated with an open cashier session; non-cash refund must retain its payment reference.

### Phase 3 — permissions and reporting

- Add explicit cashier capabilities to role templates and permission checklist.
- Ensure manager delegation cannot grant cross-branch or self-approval authority.
- Reports: cashier sales, returns requested/approved/rejected, payment methods, cash expected/actual, shortages/overages and shift status.
- Export CSV and preserve existing manager daily cash report.

## Required tests before merge

- Cashier cannot see another cashier's session or another branch's data.
- Cashier cannot create/approve a return directly or refund without approved return.
- Manager cannot approve their own request.
- Concurrent requests cannot over-return a sale.
- Rejected/pending requests do not change stock, sales totals, cash, or accounting.
- Approval posts exactly once; retries do not duplicate documents, stock, or refunds.
- Cash refund cannot exceed remaining eligible cash refund and must use the active session.
- Existing POS, payment, customer membership/loyalty, invoice, cash opening/closing and accounting tests remain green.

## Release controls

- Each code change gets GitHub Actions CI (tests, lint, production build).
- Database migrations are additive and must be tested against a disposable/staging database first.
- No production migration, live data mutation, merge, or deployment without explicit approval.
