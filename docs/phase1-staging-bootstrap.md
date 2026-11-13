# BizSathi Phase 1 — Staging Bootstrap (Auraluxe)

Status: staging project provisioned and verified. No application code or database schema has been changed.

## Provisioned staging project

- Project name: `bizsathi-staging-auraluxe`
- Supabase project ref: `vtqrygqprjvlytwjdpov`
- Region: `ap-south-1` (Mumbai)
- Project status at verification: `ACTIVE_HEALTHY`
- PostgreSQL major version: 17
- API URL: `https://vtqrygqprjvlytwjdpov.supabase.co`
- Initial database state: empty public schema; zero migrations recorded.
- Quoted project creation cost: USD $0/month.

The project ref and API URL are identifiers, not credentials. Do not commit database passwords, access tokens, service-role keys, or other secrets.

## Safety boundary

- Production Supabase project ref recorded in `supabase/config.toml`: `glulsxmkkdeaenoovgsm`.
- Treat that project as production. Do not run `supabase db push`, `supabase migration up`, reset, seed, or destructive SQL against it during Phase 1.
- Staging has its own project ref and must use separate database credentials and API keys.
- Never commit `.env`, `.env.local`, database URLs, access tokens, service-role keys, or customer data.
- Do not copy production customer personal information into staging. Prefer schema-only plus synthetic Auraluxe test records.
- Keep staging disconnected from the live Auraluxe website and live order flow until explicit cutover approval.

## GitHub workflow

1. Work only on branch `chore/phase1-staging-bootstrap`.
2. Keep all database changes as reviewed, forward-only migration files.
3. Open a pull request to `main`; do not merge until staging tests and code review pass.
4. Do not alter `supabase/config.toml` to point at staging in a shared commit. Project linking is local/operator-specific.
5. Before any database command, verify the linked project ref and compare it to the intended staging project ref.
6. Never place credentials in repository documentation or commits.

## Reconcile before restore

The production database and repository migration history have known drift (including the payment-account migration discrepancy). Therefore:

- Take a recoverable production backup using Supabase's supported backup/export facility.
- Export a schema-only snapshot from production through an authorised operator session.
- Review extensions, schemas, roles, grants, functions, triggers, policies, indexes, sequences, and storage configuration.
- Compare the snapshot with every committed migration.
- Identify objects that exist in production but are absent from migration history.
- Build a reviewed baseline/reconciliation plan. Do not blindly replay the existing migration directory onto staging until this plan exists.

## Staging restoration

The new staging project currently has no public tables and no recorded migrations. After reconciliation is approved:

- Restore the reviewed schema snapshot into staging, or apply a reviewed baseline migration.
- Apply only reviewed follow-up migrations.
- Add synthetic test fixtures for Auraluxe, including two branches, a few products/variants, opening stock, receiving, adjustments, and transfers.
- Verify RLS and RPC permissions using separate admin, staff, and unauthorised test accounts.
- Keep staging isolated from the live Auraluxe website and live order flow.

## Local CLI guardrails

Install/use the Supabase CLI in a trusted local environment. Keep production and staging connection details in local environment variables or a secrets manager, never in tracked files.

Before each command, print and verify the intended project ref. Use the staging-only project ref/database URL for restore and migration tests. Do not run production write commands as part of this bootstrap.

## Application environment separation

The app's production project reference remains in `supabase/config.toml`. Do not change production settings globally. Configure staging-only application environment variables in a separate preview/staging environment (for example, a separate Vercel preview environment or local `.env.local`) after the schema has been safely restored.

The application build/test scripts currently available in `package.json` are:

- `npm run lint`
- `npm test`
- `npm run build`

These should run in CI on the staging branch/PR. Database migration CI should be added only after migration history is reconciled and staging credentials are stored as protected GitHub Actions secrets.

## Exit criteria

- [x] Staging Supabase project exists and its ref is recorded.
- [x] Staging project status verified as healthy.
- [x] Initial staging database confirmed empty.
- [ ] Production backup/export is recoverable.
- [ ] Production schema snapshot is captured.
- [ ] Live schema vs migration drift report is complete.
- [ ] Staging schema restore succeeds.
- [ ] Existing RLS policies and privileged function grants are reviewed.
- [ ] Auraluxe synthetic inventory test cases pass.
- [ ] Staging-only application environment is configured.
- [ ] Existing production app and website remain unchanged.
