# BizSathi Phase 1 — Staging Bootstrap (Auraluxe)

Status: planning only. This document does not create a Supabase project, connect a database, run migrations, or change production.

## Safety boundary

- Production Supabase project ref currently recorded in `supabase/config.toml`: `glulsxmkkdeaenoovgsm`.
- Treat that project as production. Do not run `supabase db push`, `supabase migration up`, reset, seed, or destructive SQL against it during Phase 1.
- Keep staging in a separate Supabase project with its own project ref, database password, API URL, anon/publishable key, and service-role secret.
- Never commit `.env`, `.env.local`, database URLs, access tokens, service-role keys, or customer data.
- Do not copy production customer personal information into staging. Prefer schema-only plus synthetic Auraluxe test records.

## GitHub workflow

1. Work only on branch `chore/phase1-staging-bootstrap`.
2. Keep all database changes as reviewed, forward-only migration files.
3. Open a pull request to `main`; do not merge until staging tests and code review pass.
4. Do not alter `supabase/config.toml` to point at staging in a shared commit. Project linking is local/operator-specific.
5. Before any database command, verify the linked project ref and compare it to the intended staging project ref.

## Create the staging project

Create a new Supabase project named `bizsathi-staging-auraluxe` in the same region as production where practical. Use a new strong database password. Record the new project ref privately; do not put credentials in GitHub files or chat.

This step requires an authorised Supabase Dashboard or Supabase Management API session. GitHub repository access alone cannot provision a Supabase project.

## Reconcile before restore

The production database and repository migration history have known drift (including the payment-account migration discrepancy). Therefore:

- Take a recoverable production backup using Supabase's supported backup/export facility.
- Export a schema-only snapshot from production through an authorised operator session.
- Review extensions, schemas, roles, grants, functions, triggers, policies, indexes, sequences, and storage configuration.
- Compare the snapshot with every committed migration.
- Identify objects that exist in production but are absent from migration history.
- Build a reviewed baseline/reconciliation plan. Do not blindly replay the existing migration directory onto an empty staging database until this plan exists.

## Staging restoration

After reconciliation is approved:

- Restore the reviewed schema snapshot into staging.
- Apply only reviewed follow-up migrations.
- Add synthetic test fixtures for Auraluxe, including two branches, a few products/variants, opening stock, receiving, adjustments, and transfers.
- Verify RLS and RPC permissions using separate admin, staff, and unauthorised test accounts.
- Keep the staging project isolated from the live Auraluxe website and live order flow.

## Local CLI guardrails

Install/use the Supabase CLI in a trusted local environment. Keep production and staging connection details in local environment variables or a secrets manager, never in tracked files.

Before each command, print and verify the intended project ref. Use a staging-only database URL/project ref for restore and migration tests. Do not run production write commands as part of this bootstrap.

## Application environment separation

The app already has a production project reference in `supabase/config.toml`. Do not change production settings globally. Configure staging-only application environment variables in a separate preview/staging environment (for example, a separate Vercel preview environment or local `.env.local`) after staging is provisioned.

The application build/test scripts currently available in `package.json` are:

- `npm run lint`
- `npm test`
- `npm run build`

These should run in CI on the staging branch/PR. Database migration CI should be added only after the migration history is reconciled and staging credentials are stored as protected GitHub Actions secrets.

## Exit criteria

- [ ] Staging Supabase project exists and its ref is recorded privately.
- [ ] Production backup/export is recoverable.
- [ ] Production schema snapshot is captured.
- [ ] Live schema vs migration drift report is complete.
- [ ] Staging schema restore succeeds.
- [ ] Existing RLS policies and privileged function grants are reviewed.
- [ ] Auraluxe synthetic inventory test cases pass.
- [ ] Existing production app and website remain unchanged.
