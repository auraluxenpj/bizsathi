# Staging implementation checklist — size-aware stock

**Status: preparation only. Not authorization to execute SQL or change production.**

## Release boundary

- [ ] Confirm the target is the isolated staging project/database, not the live BizSathi database.
- [ ] Record staging project ID, database region, PostgreSQL version, migration ledger count and current commit.
- [ ] Take a fresh staging backup and verify it can be downloaded.
- [ ] Capture staging baselines for stock by business/branch/variant, confirmed and draft documents, payments, accounting journals, memberships, loyalty events and website sync bindings.
- [ ] Confirm no AURALUXE production database, website deployment, DNS, or live stock data is in the execution path.

## Draft SQL review blockers

The additive SQL in `0001_size_aware_stock_additive_draft.sql` is a proposal, not yet executable. Resolve each item before running it in staging:

- [ ] Verify composite unique constraints exist for every referenced pair: `branches(business_id,id)`, `products(business_id,id)`, `product_variants(business_id,id)`, and `profiles(id)` relationship assumptions.
- [ ] Verify `public.audit_row()`, `public.prevent_tenant_change()`, and `public.block_mutation()` exist with compatible trigger signatures.
- [ ] Verify `service_role` exists in the target Supabase environment and grant conventions match the project.
- [ ] Review RLS policies against actual membership and branch roles; ensure tenant isolation for all four tables.
- [ ] Add the explicit `UNSORTED` master seed in a separate reviewed step; the current draft intentionally does not seed it.
- [ ] Review whether `UNSORTED` should be active only for migration/reconciliation and not exposed in sale selectors.
- [ ] Confirm movement-kind coverage for every required transaction, including purchase return, transfer pair, reservation state changes and damage/write-off.
- [ ] Define a single canonical idempotency scope and payload hash strategy across all posting functions.
- [ ] Define reservation and offline allocation schemas before implementing write RPCs.
- [ ] Verify numeric quantity policy (whole units for apparel vs fractional units) with business rules.
- [ ] Verify audit trigger behavior does not attempt writes to immutable history or require unavailable fields.

## Safe staging execution sequence

1. Apply only the reviewed additive schema to a disposable staging clone.
2. Verify table definitions, indexes, constraints, grants and RLS using catalog queries.
3. Seed the exact Size Master values, including `UNSORTED`, in staging only.
4. Populate product-size options from category defaults as a reviewable proposal; require owner confirmation before activation.
5. Capture a consistent legacy stock baseline. Map existing stock to `UNSORTED` unless the individual product is confirmed genuinely non-sized; never infer from category/name/model/photo/SKU.
6. Post a separate size-opening ledger entry for each reviewed mapping. Keep legacy ledgers untouched until parity is proven.
7. Verify per-variant totals exactly match the legacy baseline; no negative size balances; no saleable stock hidden or duplicated.
8. Implement and test size-aware receive, sale, return, adjustment, transfer, reservation and offline allocation RPCs.
9. Verify document, payment, journal, membership and loyalty compatibility with historical records.
10. Run POS, website and Sheets contract tests against staging only.
11. Run concurrency, duplicate retry, role/RLS and failure-injection tests.
12. Produce a signed reconciliation report and rollback rehearsal.
13. Stop. Production rollout requires a separate explicit approval after staging acceptance.

## Rollback principles

- Before size-opening movements are posted: remove only the staging draft objects if safe and restore staging backup if necessary.
- After test movements are posted: do not delete immutable movement history. Restore the isolated staging backup or create compensating test-only entries under an approved recovery plan.
- Never roll back by editing or deleting historical production stock movements, invoices, payments, journals, membership records or loyalty events.
- Production cutover is not part of this checklist.
