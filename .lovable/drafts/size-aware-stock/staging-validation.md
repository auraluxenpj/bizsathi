# Staging validation plan — size-aware stock

**Draft only.** Run only against an isolated staging database restored from a fresh backup. Never run against production.

## Baseline capture
- Record database/project identity and branch.
- Capture counts and checksums for products, variants, stock_operations, stock_movements, commerce_stock_movements, commerce_documents, commerce_payments, memberships and loyalty events.
- Capture per-branch/per-variant balances from the current authoritative balance function.
- Capture current SKU/barcode uniqueness, RLS policies, grants, triggers and function definitions.
- Store baseline output read-only with timestamp and backup reference.

## Required assertions after schema-only install
- All existing table row counts and IDs unchanged.
- No existing stock function, trigger, policy, website binding or posting path changed.
- All new tenant tables have RLS enabled and least-privilege grants.
- Cross-business FK attempts fail.
- Unauthorized member, wrong-branch staff and anonymous requests are denied.
- Size sort order is exact; XXL and XS/S are not introduced.
- Duplicate product-size assignments and duplicate idempotency keys are rejected.
- Size history cannot be updated or deleted.

## Required assertions after a separately approved backfill
- Exactly one migration mapping per existing branch/variant, including zero balances.
- Every legacy balance equals the sum of its size-level opening allocations.
- Global and per-branch quantity totals reconcile exactly.
- No negative size balances.
- Re-running the backfill produces no duplicate rows or quantity changes.
- A changed retry payload is rejected.
- Legacy ledger row counts and checksums remain unchanged.

## Functional cases
1. Barcode scan resolves the existing product/variant, then asks for a size.
2. Sale of size M decrements only M.
3. Sale cannot consume L or UNSORTED implicitly.
4. Concurrent sale requests cannot oversell.
5. Duplicate sale request returns the original posting result.
6. Return restores the exact original size and source line.
7. Purchase receipt adds the selected size; duplicate receipt line does not double post.
8. Adjustment requires reason and authorized role.
9. Transfer decrements source size and increments destination same size atomically.
10. Deactivated size remains readable in historical records but cannot be newly selected.
11. Offline counter cannot sell beyond its allocated size quantity.
12. Replayed offline queue sync is idempotent; conflicts enter review and do not silently post.
13. Website reservation, commit, cancel and return preserve exact size and branch.
14. Existing membership and loyalty earning/reversal behavior remains unchanged.

## Release gates
- Zero unexplained balance differences.
- Zero unauthorized access findings.
- All relevant CI/unit/integration tests pass.
- Existing POS, invoice, purchase, return, reports and loyalty regression tests pass.
- Website API contract tests pass before website integration.
- Owner reviews staging reconciliation evidence and explicitly approves any production cutover separately.
