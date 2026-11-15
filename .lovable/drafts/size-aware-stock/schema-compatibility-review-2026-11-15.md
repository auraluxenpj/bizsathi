# Schema compatibility review — 15 November 2026

## Scope and safety

This was a read-only catalog inspection of the connected BizSathi database to verify the draft's referenced schema objects. No DDL, DML, migration, deployment, or application code execution was performed against the database. The connected database is the live project database, not an isolated staging clone; it was queried only with SELECT statements.

## Confirmed compatible references

The live catalog confirms these composite unique constraints exist:

- `branches(business_id, id)` — `branches_business_id_id_key`
- `products(business_id, id)` — `products_business_id_id_key`
- `product_variants(business_id, id)` — `product_variants_business_id_id_key`
- `product_variants(business_id, product_id)` — `product_variants_business_id_product_id_fkey` targets the matching product key.

The live catalog also confirms:

- `profiles(id)` is a primary key, so the actor foreign key to `profiles(id)` is structurally valid.
- The referenced helper trigger functions exist: `audit_row()`, `prevent_tenant_change()`, and `block_mutation()`.
- The referenced authorization helpers exist: `is_business_member(uuid)`, `can_access_branch(uuid,uuid)`, and `has_business_role(uuid,text)`.
- Supabase roles `anon`, `authenticated`, and `service_role` exist.
- Existing business, product and branch tables already use the audit/tenant guard functions in triggers.

## Corrections made to the draft SQL

1. Added `purchase_return`, `damage`, and `write_off` movement kinds.
2. Removed `reservation_release` from physical stock movement kinds. Reservations and offline allocations are availability holds, not physical stock movements.
3. Added direction checks: receipt/opening/return/transfer-in movements are positive; sale/purchase-return/transfer-out/damage/write-off are negative; adjustment may be either sign.
4. Added tenant immutability and audit triggers for product-size option changes.
5. Fixed the migration-map lifecycle: immutable baseline identity/quantity fields are guarded, while review status and note may advance and be audited. Deletion remains blocked.

## Remaining blockers — do not execute yet

- The draft must be reviewed against the exact staging database's schema, not assumed portable from the live catalog.
- The new custom trigger function `guard_size_stock_migration_map_update()` has only been authored in the draft. It has not been parsed or executed by PostgreSQL.
- The SQL still needs an isolated staging dry run to verify complete DDL syntax, RLS behavior, grants, triggers, and policy interaction.
- The Size Master seed, including `UNSORTED`, remains a separate reviewed operation.
- Reservation and offline counter-allocation tables and RPCs are not yet part of this additive SQL.
- Size-aware posting functions, return caps, transfer atomicity, concurrency locking, accounting journal integration, and website/POS/Sheets adapters remain design work.
- The current additive SQL is not a complete production migration and must not be registered in Drizzle or applied to the live database.

## Decision

The original composite-FK and helper-function blockers are resolved by catalog evidence for the currently connected live schema. The migration is still **not staging-validated** and is **not approved for execution**. Next safe step is to provision/use a dedicated BizSathi staging clone, capture its own baseline, then run this reviewed draft there only.


## Staging execution result — 15 November 2026

The separate `bizsathi-staging-auraluxe` Supabase project was initially empty (PostgreSQL 17.11.0.019, ap-south-1). Base migrations 0000–0029 were applied, with one staging-only prerequisite patch for the missing payment-QR helper and bucket. Bootstrap stopped at migration 0030 because the current repository's 0024 payment-accounts file is comment-only while 0030 expects `public.payment_accounts`. This gap is documented and was not bypassed.

The size-aware additive draft was then applied successfully as `size_aware_stock_additive_staging_draft`. Catalog verification confirmed:

- Four tables exist: `size_master`, `product_size_options`, `variant_size_stock_movements`, `size_stock_migration_map`.
- RLS is enabled on all four; each has its expected SELECT policy.
- Expected audit, tenant, immutable-ledger and migration-map guard triggers exist.
- Composite foreign keys, uniqueness/idempotency and quantity-direction constraints are present.
- All four tables have zero rows; no size master seed or stock backfill was run.

**Conclusion:** staging DDL validation passed for the additive size schema. Full application staging validation is still blocked by incomplete legacy migration artifacts; no runtime transaction, POS, website, Sheets, concurrency or RLS user-session test has yet passed. Production remains unchanged.
