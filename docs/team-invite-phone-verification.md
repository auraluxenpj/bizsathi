# Team invitation phone verification — staging rollout

## Invitation contract

- A new branch-scoped invitation is bound to one verified email address and one normalized Nepal mobile number. The email is stored in lowercase; both identity values must match the authenticated account at acceptance.
- The database stores the number on the invitation row and exposes only its masked email and last four mobile digits in the invitation status and public preview.
- Phone-bound invitations are single-use. The role, business, branch, inviter, expiry and mobile are server-assigned.
- Acceptance requires a confirmed Supabase Auth email that exactly matches the invited email, plus a confirmed Auth phone that normalizes to the exact invited mobile.
- The join page uses Supabase Auth `updateUser({ phone })` followed by `verifyOtp({ phone, token, type: 'phone_change' })`. OTP codes are not stored by BizSathi.
- The database rechecks invitation validity, inviter authority, branch delegation, role rank and mobile match inside the acceptance transaction.

## Staging-only Auth setup required for real SMS

Before real-device acceptance tests:

1. Open the isolated staging Supabase project in Auth settings.
2. Enable the Phone provider for that staging project only.
3. Configure an SMS provider and its credentials in Supabase Auth settings. Do not commit provider secrets to GitHub or frontend environment variables.
4. Set an appropriate OTP expiry and request rate limits; verify the SMS template and destination-country support.
5. Add the staging app URL and `/auth` redirect URL to the staging Auth URL allow-list.
6. Test a disposable account: confirm email, request phone-change OTP, verify the invited number, accept once, then confirm a second acceptance and a different mobile are rejected.

Production Auth settings must not be changed as part of this staging phase.

## Database verification

Migrations 0046 and 0047 are applied to the isolated Tokyo-region staging Supabase project `efcxhbyaazfvpbaxyvpu`. The SQL regression script `supabase/tests/team_access.sql` passed there and rolls back its synthetic fixtures.

The connected staging project currently contains zero business, membership, branch, team-invitation, invitation-use and delegation rows after the test run.

## Configuration caution

The checked-in `supabase/config.toml` project reference does not currently match the connected staging project used for the isolated SQL test. Reconcile this reference before running Supabase CLI migration push/deploy commands. Do not point it at production as a workaround.
