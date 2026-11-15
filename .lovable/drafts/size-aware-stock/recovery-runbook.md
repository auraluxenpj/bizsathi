# Size-aware stock — staging recovery runbook

**Draft only.** No production rollback or destructive SQL is authorized by this document.

## Before staging work
1. Confirm the target is the isolated staging project/database, not the live BizSathi database.
2. Create a fresh database backup and verify that it can be restored.
3. Record project ID, database region, PostgreSQL version, migration ledger count and current commit.
4. Export baseline counts, per-variant balances and relevant function/policy/trigger definitions.
5. Confirm no live website or POS is pointed at staging.

## If schema-only staging install fails
- Stop immediately; do not retry blindly.
- Save the exact SQL, error, timestamp and database identity.
- If the failed DDL transaction rolled back, verify that no objects remain.
- If objects partially exist, inspect them and compare to the draft manifest.
- Remove only newly created, empty staging-only objects after review. Do not cascade-drop shared dependencies.
- Restore staging from the verified backup if state is uncertain.

## If backfill or reconciliation fails
- Keep the new size-stock feature disabled.
- Do not switch the authoritative balance function.
- Do not edit or delete legacy stock operations, movements, invoices or returns.
- Preserve failed run IDs and all append-only evidence.
- Re-run only after the root cause is understood and a deterministic, idempotent correction is reviewed.
- If the staging database is uncertain, restore the pre-test backup and repeat from a clean clone.

## If cutover tests fail
- Stop new test sales and reservation traffic.
- Keep production untouched.
- In staging, restore the legacy balance function only if the cutover design includes a tested reversible function switch and the old ledger has not been mutated.
- Verify every variant balance against the pre-cutover baseline.
- If any discrepancy remains, restore the staging snapshot rather than attempting ad-hoc quantity corrections.

## Production boundary
Production migration, backfill, website API switch, POS activation and deployment each require separate explicit approval after staging evidence is reviewed. Never use a destructive rollback against immutable financial or stock history.
