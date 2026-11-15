# Production schema review — 2026-11-15

Status: read-only inspection of the live BizSathi Lovable Cloud database. No rows, policies, functions, memberships, invitations, or permissions were changed.

## Confirmed existing objects

The live public schema contains:
- `business_memberships` with `business_id`, `user_id`, `role_code`, `job_title`, and `status`.
- `branch_memberships` keyed by business, branch, and user; foreign keys ensure the branch and user membership belong to the same business.
- `branches` with business ownership and unique branch code per business.
- `business_invitations` with email/mobile contact, invitee name, job title, role code, token hash, expiry, accepted and revoked timestamps.
- `roles` and existing role-rank / membership authorization helpers.

Important constraints:
- Invitation role cannot be `owner`.
- Invitation contact must include email or mobile.
- Mobile is normalized to ten digits.
- Token hash must be a 64-character lowercase hex string.
- Branch grants are tied to an existing membership and branch in the same business.
- Membership and invitation job titles are descriptive fields; they are not an independent secure delegation grant.

## Confirmed application behavior from main

- `createInvitation` checks `has_business_role(..., 'admin')` and calls the email-based invitation RPC.
- `createMobileInvitation` also checks admin-level access before calling `create_business_invitation_v2`.
- `acceptInvitation` calls the existing email-bound `accept_business_invitation` RPC.
- `setBranchAccess` delegates authorization to the database RPC.
- Mobile/password login resolves a mobile number to an email and then uses Supabase password sign-in.
- Current job-title mapping maps `manager` to the `accountant` security role. That is not sufficient to grant branch-specific staff invitation/delegation authority.
- Current mobile invitation acceptance path must be audited for proof of OTP verification before it can satisfy the new requirement.

## Master identity check

The requested email account exists in `auth.users`. Its current ordinary owner membership is associated with a different business ID than the AURALUXE workspace. This confirms the account is real, but does not establish a platform-wide master-owner authority. No global privilege was granted.

A future implementation must map the authenticated immutable auth user ID to a protected platform-owner record, and must explicitly provision that mapping through a controlled owner approval path. Never trust a client-supplied email string.

## Implementation consequences

1. Keep ordinary business owner/admin roles distinct from a platform-wide master-owner capability.
2. Add an explicit delegation record with business ID, manager user ID, branch ID, allowed role codes/permission keys, grantor, and revocation metadata.
3. Store branch scope and delegated role on the invitation itself. Do not accept these values from the invitee during acceptance.
4. Make the invitation-creation RPC verify the caller's current membership, branch grant, delegation allow-list, role rank, and target branch in the same transaction.
5. Acceptance must require verified email and verified mobile/OTP, consume the token once, and create the membership plus branch grant atomically.
6. Preserve current invitation paths until the replacement has passed staging and regression tests.
7. Audit the exact live SQL definitions of all invitation, role-update, branch-access, and permission RPCs before writing a migration. Do not infer function behavior from function names or staging.
8. No production migration, role change, owner provisioning, or deployment is authorized by this review.

## Known verification limits

This pass inspected production table/column metadata, constraints, relevant function signatures/definitions, RLS policies, triggers, selected membership identity metadata, and current application source. Migration metadata was not exposed through the queried schemas. Before a migration is drafted, capture the authoritative Lovable migration history and inspect the full definitions and grants of the exact live RPCs that will be replaced or called.
