# Access hierarchy hardening review

Review base: `d8a694a8ed32e8d8f48b8fa06988ecdacacd0bfc` (15 Nov 2026)

This branch is a review/staging change only. It does not apply migrations, change database data, or deploy the app.

## Confirmed integration gaps

1. `src/components/business-access.tsx` still reads `business_invitations` and calls the legacy `create_business_invitation_v2` / `reissue_invitation` / `change_invitation_role` RPC path. It does not yet use `team_invitations`, `create_team_invitation`, `preview_team_invitation`, `accept_team_invitation`, or the delegation RPCs from migration 0042.
2. `src/components/invite.tsx` calls the legacy `accept_business_invitation` RPC. It does not call the new branch-scoped acceptance function.
3. Signup currently stores the mobile number in user metadata. It does not set and verify the Supabase Auth phone number, while `accept_team_invitation` correctly requires both `auth.users.email_confirmed_at` and `auth.users.phone_confirmed_at`.
4. The current mobile login server function resolves a mobile number to an email using `login_email_for_mobile`. This should remain server-side and must be checked against the verified phone on the same Auth user before enabling the new workflow.
5. `.github/workflows/ci.yml` runs Vitest, lint and build only. It does not apply the database migrations or execute `supabase/tests/team_access.sql`.

## Change made in this branch

- Changed `supabase/tests/team_access.sql` to run inside an explicit transaction, emit a successful NOTICE, and ROLLBACK. Previously the final deliberate exception made a passing test exit with a SQL error, which is unsuitable for normal CI execution.

## Required next implementation phases

- Wire branch-scoped invitations and invitation preview/acceptance through typed server functions and the actual UI.
- Add an explicit branch selector and delegation-grant management. Branch membership alone must not grant invitation authority.
- Implement email confirmation followed by Supabase Auth phone update/OTP verification; do not treat user metadata as phone verification.
- Add tests for the server functions and UI, plus a disposable database CI job that applies migrations through 0042 and runs the SQL test file.
- Bootstrap the platform owner only after confirming the correct immutable Auth UUID, through a controlled database-admin procedure. Do not bootstrap by matching a client-supplied email.
- Run the migration and tests on an isolated staging database before any production rollout.

## Safety

Do not merge this branch or apply migration 0042/0043 to production until the integration phases above are complete and staging tests pass. Existing legacy login/invitation flows should not be removed before regression coverage is in place.
