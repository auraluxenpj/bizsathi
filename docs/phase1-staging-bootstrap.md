# BizSathi Phase 1 — Staging Bootstrap (Auraluxe)

Status: staging project provisioned and verified. Production identity has now been confirmed by the user. No production database writes or schema changes have been performed.

## Provisioned staging project

- Project name: `bizsathi-staging-auraluxe`
- Supabase project ref: `vtqrygqprjvlytwjdpov`
- Region: `ap-south-1` (Mumbai)
- Project status at verification: `ACTIVE_HEALTHY`
- PostgreSQL major version: 17
- API URL: `https://vtqrygqprjvlytwjdpov.supabase.co`
- Initial database state: empty public schema; zero migrations recorded.
- Quoted project creation cost: USD $0/month.

## Confirmed Auraluxe production project

The user confirmed that the live Auraluxe production project is:

- Project name: `auraluxe26@gmail.com's Project`
- Supabase project ref: `efcxhbyaazfvpbaxyvpu`
- Region: `ap-northeast-1` (Tokyo)
- Project status: `ACTIVE_HEALTHY`
- PostgreSQL major version: 17

**Configuration discrepancy requiring resolution:** repository `supabase/config.toml` and the previously tracked `.env` point to `glulsxmkkdeaenoovgsm`, not the user-confirmed production ref `efcxhbyaazfvpbaxyvpu`. Do not silently change production configuration or assume the old ref is safe to discard. Verify deployment environment configuration and repository history before updating any references.

**Database inspection blocker:** Supabase project metadata is accessible through the Aura connection, but read-only table inspection, migration listing, and a simple `SELECT current_database()` all fail with PostgreSQL password authentication errors (SQLSTATE `28P01`; connector attempts use `supabase_read_only_user` or `postgres`). This indicates the connector's stored database credentials are not currently valid for the confirmed production project. No database query succeeded.

The project refs and API URLs are identifiers, not credentials. Do not commit database passwords, access tokens, service-role keys, or other secrets.

## Safety boundary

- Treat `efcxhbyaazfvpbaxyvpu` as Auraluxe production, based on explicit user confirmation.
- Treat `vtqrygqprjvlytwjdpov` as the separate staging project.
- Do not run `supabase db push`, `supabase migration up`, reset, seed, or destructive SQL against production during Phase 1.
- Staging has its own project ref and must use separate database credentials and API keys.
- Never commit `.env`, `.env.local`, database URLs, access tokens, service-role keys, or customer data.
- Do not copy production customer personal information into staging. Prefer schema-only plus synthetic Auraluxe test records.
- Keep staging disconnected from the live Auraluxe website and live order flow until explicit cutover approval.

## GitHub workflow

1. Work only on branch `chore/phase1-staging-bootstrap`.
2. Keep all database changes as reviewed, forward-only migration files.
3. Open a pull request to `main`; do not merge until staging tests and code review pass.
4. Do not alter `supabase/config.toml` to point at staging in a shared commit. Project linking is local/operator-specific.
5. Before any database command, print and verify the intended project ref and connection target.
6. Never place credentials in repository documentation or commits.

## Reconcile before restore

The production database and repository migration history have known drift (including the payment-account migration discrepancy). Therefore:

- Restore valid connector database access or use an authorised local operator session to inspect production.
- Take a recoverable production backup using Supabase's supported backup/export facility.
- Export a schema-only snapshot from production.
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

The app's production reference in the repository is currently inconsistent with the user-confirmed live project. Verify the deployed application's actual environment before updating any repo config. Configure staging-only application variables in a separate preview/staging environment after the schema has been safely restored.

The app's available scripts include:

- `npm run lint`
- `npm test`
- `npm run build`

These should run in CI on the staging branch/PR. Database migration CI should be added only after migration history is reconciled and staging credentials are stored as protected GitHub Actions secrets.

## Exit criteria

- [x] Staging Supabase project exists and its ref is recorded.
- [x] Staging project status verified as healthy.
- [x] Initial staging database confirmed empty.
- [x] Auraluxe production project identified and confirmed by user.
- [ ] Connector database credentials repaired / authorised production inspection available.
- [ ] Production backup/export is recoverable.
- [ ] Production schema snapshot is captured.
- [ ] Live schema vs migration drift report is complete.
- [ ] Repository/deployment production project reference discrepancy is resolved.
- [ ] Staging schema restore succeeds.
- [ ] Existing RLS policies and privileged function grants are reviewed.
- [ ] Auraluxe synthetic inventory test cases pass.
- [ ] Staging-only application environment is configured.
- [ ] Existing production app and website remain unchanged.
