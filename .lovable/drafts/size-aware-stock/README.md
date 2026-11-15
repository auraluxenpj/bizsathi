# Size-aware stock migration — draft only

**Status:** Design artefacts on `draft/size-aware-stock-migration`. Not a production migration. Do not execute or merge.

## Non-negotiable invariants

- Preserve all existing product, variant, SKU, barcode, stock-operation, stock-movement, commerce-document, payment, membership and loyalty IDs/history.
- Keep one existing product variant and barcode per current SKU. POS scans the existing barcode, then asks staff to select a size.
- Do not create per-size product_variants or per-size SKUs.
- New size-level stock is a separate append-only ledger keyed by business, branch, existing variant and size.
- Do not change the existing combined stock function, website binding, posting RPCs, RLS, or production database in this draft.
- Do not alter confirmed commerce_documents.lines JSONB or old movements.
- No negative stock, cross-tenant access, branch bypass, duplicate posting, or non-idempotent retries.

## Agreed size master

Seed exactly: STANDARD (0, not plus), M (1), L (2), XL (3), 2XL (4), 3XL (5), 4XL (6, plus), 5XL (7, plus), 6XL (8, plus), 7XL (9, plus), 8XL (10, plus). No XXL alias and no XS/S. Owner may rename, deactivate and reorder; no deletion once referenced by stock history.

## Data model proposal

1. `size_master`: tenant-scoped stable size key, display label, sort order, plus flag and active flag.
2. `product_size_options`: tenant/product/size assignment; one row per permitted size; category defaults seed options but owner can curate.
3. `variant_size_stock_movements`: append-only ledger referencing the existing variant ID, branch ID, size ID, source event, actor, reason and unique idempotency key.
4. `size_stock_migration_map`: immutable evidence mapping each existing business/branch/variant aggregate to one initial size bucket and baseline quantity, including a baseline capture identifier and reconciliation state.
5. A read-only size balance projection, grouped by business/branch/variant/size.

The exact SQL is intentionally not finalized in this draft. Before writing executable DDL, verify all existing FK constraints, functions, role ranks, branch permissions, policies, triggers, grants and transaction posting call paths in the current database.

## Legacy stock conversion

The current aggregate quantity is the authoritative starting point. Category is only a suggested default, not proof of physical size:
- Apparel categories (Kurti Set, Party Wear, Winter Wear, Co-ord Set, Dress, Suit, Bottom, Shirt): UNSORTED pending physical count.
- Sarees, Unstitched, Accessories and Purse: STANDARD only where confirmed to be non-sized; otherwise UNSORTED.
- No size may be inferred from product names, model codes, photos or old SKU.
- Every existing active variant, including zero-stock variants, receives a mapping row.
- Opening allocation quantity must equal the current combined balance exactly. Never rewrite the old ledger.
- UNSORTED is a migration bucket, not a saleable size. It must be physically counted and transferred into known sizes using audited adjustments before size-specific selling is enabled.

**Critical correction to the prior proposal:** category alone is not enough to assign STANDARD. The initial default must be UNSORTED unless a product is explicitly confirmed as non-sized. This prevents accidental size assumptions.

## Cutover model

Do not run old and new stock balance sources concurrently. A future, separately approved cutover must:
1. Freeze stock posting for a short controlled window.
2. Capture a transactionally consistent aggregate balance baseline for every branch/variant.
3. Create exactly one size opening allocation per mapping row.
4. Reconcile row counts, totals and each variant balance.
5. Atomically switch the authoritative balance/posting functions behind a feature flag or controlled function replacement.
6. Resume posting only after verification.
7. Keep old ledgers read-only as historical evidence.

Until that cutover is separately approved, all existing stock operations and website sync remain on the legacy path.

## Compatibility

- Legacy SKU-only stock events cannot silently choose a size. Route them to UNSORTED or reject them after cutover, depending on operation type.
- New POS/website sales must carry an explicit size ID.
- Website availability must return per-size availability and reservation IDs.
- Returns must reference the original sale line and restore its original size.
- Offline POS must consume pre-allocated size quantities; it cannot create stock or exceed its allocation.
- Google Sheets imports require explicit size or an explicitly selected UNSORTED receiving path, plus receipt line ID and idempotency key.
- Existing website push acknowledgement API must be retired only after replacement transaction APIs are tested and production cutover is approved.

## Security requirements

- RLS enabled on every exposed new table.
- Tenant scoping on every FK and unique key.
- Read access follows existing branch-access rules; size master and product-size options follow existing business membership/admin rules.
- Writes occur only through authenticated, role-checked database functions or trusted server code; never rely on client-supplied actor/role.
- Revoke default PUBLIC/anon/authenticated grants; grant least privilege explicitly.
- No new SECURITY DEFINER function in public without documented necessity, fixed search_path, explicit auth/tenant/branch/role checks, and restricted EXECUTE grants.
- Append-only movement and migration evidence; corrections are new movements, never UPDATE/DELETE.
- Use the existing business advisory lock and lock the relevant balance rows/keys before checking and posting.
- Idempotency key must be unique per business and exact-payload retries return the original result; changed-payload retries fail.

## Outstanding verification before executable SQL

- Inspect all commerce posting and return functions, especially how confirmed document lines and movements are created.
- Inspect current RLS and grants on all stock-related tables, including any policies created by later migrations.
- Inspect the full definition of `commerce_stock_balance`, `post_stock_operation`, `post_commerce_document`, and branch permission helpers.
- Confirm current product category defaults and actual per-product size decisions with the owner.
- Define reservation expiry, offline counter allocation, and sync conflict policy.
- Agree whether UNSORTED is visible as “size not yet counted” in admin only and blocked from online sale.

## Scope boundary

This branch contains documentation drafts only. It does not modify app runtime code, migrations, database schema/data, website code, or production deployment.
