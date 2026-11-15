# Access hierarchy implementation plan — staging-first

This branch hardens login identifier handling and records the safe implementation sequence for the master-owner / branch-manager / team hierarchy.

## Login decision

Keep the existing password login experience. Every active user, including business admins and the platform master owner, may sign in with either:

- Their verified email address + password, or
- Their registered Nepal mobile number + the same password.

The mobile login lookup remains server-only. The browser receives only the Supabase session tokens; it never receives the email mapped to a mobile number. Mobile inputs accept 10 digits and optional Nepal `+977` / `977` prefix with common separators. Password minimum remains 8 characters.

The new `login-identifier.ts` helper is shared by the sign-in screen and tests. It does not change the server-side authentication or role authorization.

## Invitation identity verification

Use Supabase Auth's native phone-change verification for a signed-in invitee, rather than asking users for an OTP at every login:

1. Invitee creates/signs into their account with email + password (or signs in with existing email/mobile + password).
2. Email must be confirmed by Supabase Auth.
3. If the account's Auth phone is not already confirmed and matching the invitation mobile, the invitee submits the invited mobile to Supabase Auth `updateUser({ phone })`.
4. Supabase sends its phone-change OTP through the configured SMS provider. The invitee enters the code; client calls `verifyOtp({ phone, token, type: 'phone_change' })`.
5. Server-side acceptance RPC verifies the authenticated user's `email_confirmed_at`, `phone_confirmed_at`, normalized Auth phone, invitation email/mobile, one-time token, expiry and revocation state in one transaction.
6. Only then create the membership and branch grant atomically.

Do not trust profile metadata or a user-entered phone as proof of ownership. Do not store or accept OTP codes in application tables. Use Supabase Auth's verified phone claim. OTP is only for initial invitation/account verification; routine login stays password-based by email or mobile.

### External setup required before OTP tests

The staging Supabase Auth project must have Phone provider enabled and an SMS provider configured (for example Twilio or another supported provider), with rate limits and templates set. No SMS provider credentials are present in source and none should be committed. Without this setup, OTP delivery cannot be tested end-to-end. Production Auth settings must not be changed as part of staging work.

## Hierarchy authorization model

- Platform owner is a protected platform-level identity keyed by immutable `auth.users.id`, not an email supplied by the browser. Bootstrap the intended owner only after confirming the exact Auth UUID and via a controlled, audited provisioning step.
- Branch manager delegation is an explicit row scoped to business + branch, with allowed role codes and permissions, grantor, timestamps and revocation.
- Invitation rows carry immutable server-assigned branch scope and delegated role. Inviter cannot widen scope or elevate role by tampering with request data.
- Every create/accept/revoke/reissue/role-change/branch-grant RPC re-checks actor identity, current membership, branch grant, allow-list, role rank and business/branch relationship atomically.
- Master owner can inspect and revoke all delegated grants, memberships and invitations; managers cannot demote/remove master owner or create peer managers unless explicitly delegated.
- RLS must restrict managers to their current delegated branches and prevent direct table/RPC bypass.
- All delegation and invitation changes are audited.

## Rollout and safety

1. Reconcile live production RPC definitions and migration history; the live DB contains function definitions absent from checked-in migration history.
2. Build additive migrations and replacement RPCs on the isolated staging project only.
3. Configure staging SMS provider and test verified email + verified phone.
4. Add RLS/RPC tests for owner spoofing, branch isolation, delegation allow-list, invitation tampering, replay/expiry/revocation and master-owner protection.
5. Regression-test existing email/mobile password login, memberships, POS, stock, sales, finance, customer memberships and loyalty.
6. Keep feature disabled until all tests pass. No production migration, Auth settings change, merge or publish is authorized by this branch.

## This branch changes

- Shared, unit-tested email/mobile login identifier parsing.
- Sign-in screen uses the shared parser while retaining the existing email/mobile + password flows.
- No schema, data, role, permission, invitation, Auth provider or deployment changes.
