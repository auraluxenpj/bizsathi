# Employee ID staging preview setup

## Purpose and safety boundary

This guide is for testing the Employee ID work from PR #70 against the original Tokyo staging Supabase project only.

- Staging Supabase project ref: `efcxhbyaazfvpbaxyvpu` (Tokyo, `ap-northeast-1`).
- Production Supabase project ref: `glulsxmkkdeaenoovgsm`. Never use this ref for staging tests.
- The public BizSathi website must remain connected to production.
- Do not publish this test build to the production domain.
- Do not run migrations against production. Employee ID migrations `0053` and `0054` were applied to the Tokyo staging project only.
- Do not commit credentials, access tokens, database URLs containing passwords, or service-role keys.

## Required runtime configuration

A dedicated unpublished preview/test deployment must receive values for the same staging project:

| Variable | Required value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://efcxhbyaazfvpbaxyvpu.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key belonging to `efcxhbyaazfvpbaxyvpu` |
| `SUPABASE_URL` | `https://efcxhbyaazfvpbaxyvpu.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key belonging to `efcxhbyaazfvpbaxyvpu` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role/secret key belonging to `efcxhbyaazfvpbaxyvpu`; server secret only |

The `VITE_` variables are embedded in the browser build and therefore must contain only the staging URL and staging publishable key. Never put a service-role/secret key in a `VITE_` variable or browser-visible configuration.

The server variables must also point to the same staging project. Mixing a staging browser URL with a production server URL (or vice versa) is unsafe and must be treated as a failed setup.

`LOVABLE_DB_MIGRATION_URL` is a separate Drizzle migration connection setting. It is not needed for ordinary app runtime or browser testing. Do not configure or use it for this test unless a separately reviewed staging migration is explicitly required.

## Important repository configuration warning

The current Vite configuration contains a production fallback for `glulsxmkkdeaenoovgsm`. A preview build must explicitly override both `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` with the Tokyo staging values. If the preview platform cannot guarantee these overrides, do not use that preview for testing.

GitHub Actions CI uses placeholder Supabase values only. A passing CI run validates tests, lint and build; it does not prove a connection to either real Supabase project.

## Verification checklist before any employee test

1. Confirm the test deployment is unpublished and has a separate preview hostname.
2. Confirm all five runtime variables above belong to the Tokyo staging project. Never share the service-role key in chat or commit it.
3. Open browser DevTools > Network on the preview and inspect a Supabase request. Its hostname and `sb-project-ref` response header must identify `efcxhbyaazfvpbaxyvpu`.
4. Confirm the public production website still reports `glulsxmkkdeaenoovgsm`.
5. Only then run controlled staging-only invitation, OTP verification, Employee ID display and Employee ID login tests using test accounts.
6. Check staging records after testing and clean up only the test records created for that run.

If any check points to production, stop immediately and do not submit forms, accept invitations, or change account settings.

## Current status

- PR #70 contains the Employee ID feature and remains unmerged.
- The staging database migrations were applied and their schema/privileges were checked.
- No full invitation-to-login end-to-end test has passed yet.
- The Lovable remix attempt could not create a separate test project because the workspace had no credits.
- This document is preparation only. It does not change app runtime configuration, secrets, database schema, Auth settings, or deployment state.

## GitHub Actions staging workflow

The branch includes `.github/workflows/employee-id-staging.yml`. It runs tests and lint, then performs a read-only Auth health check only when both of these repository Actions secrets are configured:

- `STAGING_SUPABASE_URL` — must be exactly `https://efcxhbyaazfvpbaxyvpu.supabase.co`.
- `STAGING_SUPABASE_PUBLISHABLE_KEY` — publishable/anon key from that same Tokyo staging project.

Add them under GitHub repository Settings → Secrets and variables → Actions → Repository secrets. Do not add the production URL or key. Do not add a service-role key; this workflow does not need one and never writes to the database. If the secrets are absent, the staging network check is skipped and the build uses CI placeholders. A successful quality-only run must not be mistaken for a successful staging connection test.

The workflow is restricted to this feature branch and has no deployment or migration steps. It does not publish a website or alter database records.
