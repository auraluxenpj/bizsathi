# Phase 1 code review — staging prerequisites

Date: 2026-11-13

This is a review record only. It does not change application code or database state.

## Scope reviewed

- `drizzle/migrations/0004_inventory_master_data.sql`
- `drizzle/migrations/0011_legacy_stock_combined_balance.sql`
- `drizzle/migrations/0022_website_stock_sync.sql`
- `drizzle/migrations/0037_price_levels.sql`
- `src/lib/inventory.functions.ts`
- `src/lib/website-sync.functions.ts`
- `supabase/INVENTORY_SECURITY.md`

## Findings

### 1. Stock operation RPC

The current function definition originates in migration 0004 and is subsequently patched by migration 0011 to use `commerce_stock_balance`.

Positive controls already present:
- role and branch authorization;
- per-business transaction advisory lock;
- active variant and branch checks;
- idempotency check for repeated operation IDs;
- atomic operation and movement inserts;
- stock balance check;
- database constraints restrict operation kinds to opening, receive, adjustment and transfer, enforce positive quantities except adjustment, and require a valid destination for transfers.

Hardening opportunity:
- The function maps only opening/adjustment to admin; every other value is treated as staff before the table constraint rejects unknown kinds. Add an explicit allowlist at the start of the function so invalid kinds fail clearly before authorization/processing.
- Add focused tests for null/unknown kinds, missing transfer destination, inactive destination, invalid quantities, and retry payload mismatch.

This is a hardening item, not evidence that arbitrary operation kinds can be persisted: the table CHECK constraint currently rejects them.

### 2. Website stock integration

The website stock sync is intentionally Auraluxe-specific today:
- application input uses `z.literal(AURALUXE_BUSINESS_ID)`;
- migration 0022 pins the Auraluxe business UUID in begin/read snapshot RPCs;
- the sync binding table currently constrains connection to `auraluxe`.

This is consistent with validating Auraluxe first, but it is not yet a generic multi-business integration. Keep it explicitly scoped to Auraluxe for Phase 1; do not remove the business guard or generalize it without a separate integration design and authorization tests.

### 3. Catalogue import

The current `save_catalogue_variant` function is admin-only, uses a single transaction, enforces an import row limit, and relies on table constraints/unique indexes for product and variant integrity. Add tests for malformed row shapes, blank names/SKUs, invalid numeric values, and duplicate barcode/SKU rollback. Do not rewrite this function without confirming the latest deployed definition and client schema.

### 4. Existing security verification

`supabase/INVENTORY_SECURITY.md` records prior successful disposable-harness inventory isolation tests and 23 focused unit/routing tests. It also records that live product/contact save and movement read-back were not verified using legitimate business records. Treat those limitations as still open until re-tested in the correct staging environment.

## Blocking environment identity reconciliation

The repository configuration and the Lovable database screenshots do not yet identify one unambiguous database:
- repository configuration was previously found pointing to project ref `glulsxmkkdeaenoovgsm`;
- a separately visible Supabase project ref `efcxhbyaazfvpbaxyvpu` is in Tokyo;
- the Lovable database screenshot reports Singapore, PostgreSQL 17.11, and 34 public tables, but does not expose a project ref.

Do not apply migrations, restore a baseline, or run repair SQL until the Lovable project's actual Supabase project ref is confirmed and matched to the intended Auraluxe production/staging boundary.

## Recommended next sequence

1. Identify the exact project ref behind the Lovable SQL editor.
2. Export/read the live migration history and compare it with all committed migrations.
3. Prepare a schema-only baseline for the confirmed staging project.
4. Apply migrations only to staging, then run the existing SQL regression suite.
5. Implement the explicit stock-kind allowlist and its tests in a separate code PR after confirming the staging baseline.
6. Keep production unchanged until the staging suite and Auraluxe end-to-end workflows pass.
