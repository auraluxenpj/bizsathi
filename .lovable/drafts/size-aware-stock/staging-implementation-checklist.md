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


## Live staging run — 15 November 2026

- Staging project `bizsathi-staging-auraluxe` (Supabase ref `vtqrygqprjvlytwjdpov`), region `ap-south-1`, PostgreSQL `17.11.0.019`.
- Confirmed initially empty: no public tables or recorded migrations, and no business/customer/stock data.
- Applied base schema migrations through `0029_member_permission_denials` plus a staging-only payment-QR prerequisite patch.
- Base bootstrap then stopped at migration `0030_permission_checklist_headers`: it expects `public.payment_accounts`, but source migration `0024_payment_accounts.sql` is intentionally comment-only in the current repository. Do not bypass this gap by guessing the account schema.
- Applied `size_aware_stock_additive_staging_draft` successfully to staging.
- Verified all four proposed tables exist with RLS enabled, four SELECT policies, expected triggers, composite foreign keys, unique/idempotency constraints and quantity-direction checks.
- Verified all four new tables contain zero rows. No size seed, product-size assignments, opening movements, or legacy stock mapping was inserted.
- No production database or AURALUXE website was changed.

### What this proves

The current additive size-aware DDL parses and creates its objects on the prepared staging base schema. It does **not** prove full-app migration parity, runtime RPC behavior, RLS behavior for real users, POS/website/Sheets integration, or stock reconciliation.

### Next staging gates

1. Reconcile the intentionally disabled/missing migration artifacts (beginning with payment accounts and the notebook/bill-gallery helper) from the actual live schema or a verified canonical migration source.
2. Complete the app's staging schema without copying live business/customer/stock data.
3. Create synthetic test tenant/users in staging only.
4. Add size-master seed and run positive/negative constraint, RLS and trigger tests.
5. Implement and test posting RPCs and adapters before any production proposal.


## Full staging schema bootstrap — follow-up run, 15 November 2026

The previously blocked schema bootstrap has now been completed in the isolated staging project:

- Reconstructed `payment_accounts` from the live catalog's verified columns, constraints, unique index, RLS read policy and grant pattern in a staging-only reconciliation migration. No live schema was changed.
- Applied `0030_permission_checklist_headers` successfully.
- Applied the remaining source migrations `0033`–`0041`.
- Detected that the staging migration ledger lacked `0031` and `0032` even though later migrations had been applied. Applied their source SQL as explicit `reconcile_0031...` and `reconcile_0032...` staging migrations. For 0032, used `CREATE OR REPLACE` for the already-existing one-argument `read_customer_loyalty(uuid)` function; the source otherwise applied successfully.
- Verified `purchase_price`, `model_code`, `mrp`, and `wholesale_price` columns and the loyalty read/earning functions exist.
- Verified all business, product, variant, stock, invoice, membership, loyalty and size-ledger tables contain zero rows.
- Verified the size tables' RLS policies and audit/tenant/immutability triggers remain present.

### Current status

The staging schema is now bootstrapped sufficiently for synthetic test-fixture preparation. The database is intentionally empty: no business, user, product, stock, customer or financial records were copied from production.

Still not tested: authenticated RLS behavior with actual staging users, mutation permissions, posting RPCs, size-level stock arithmetic, transaction rollback, concurrency, offline allocation, and external adapters. Do not treat schema bootstrap as application acceptance.
