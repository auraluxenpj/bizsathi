# BizSathi master-owner and branch delegation — design draft

Status: design and security contract only. Not a production migration or implementation.
Target: a reviewable, additive access-control change that works with the existing business membership and branch membership model.

## Required hierarchy

1. **Global master owner** — the verified account `vikkygupta52@gmail.com`. This is a platform-level authority, not merely an ordinary `owner` role in one business. It has visibility and administrative authority across every BizSathi business, branch, member, invitation, and delegated role. The account must be bound by a trusted server-side identity record / protected configuration and verified against the authenticated user ID. Email text supplied by a browser is never sufficient to grant this authority.
2. **Business / store manager** — appointed by the master owner for one or more explicit branches. A manager may invite and administer team members only in branches assigned to them, and only for roles and permissions delegated to them.
3. **Branch team member** — receives the specific role, permissions, and branch scope in the invitation. The invitee cannot select or elevate their own role.

## Delegation rules

- Master owner may appoint or revoke a manager, assign branches, and define the maximum role/permission set that manager can delegate.
- A manager can invite team members only into a branch they currently manage.
- A manager can assign only roles explicitly included in their delegation grant and always below their own authority.
- A manager cannot create or appoint another manager unless the master owner explicitly grants that delegation.
- No manager can grant access to a different business or unassigned branch.
- No manager or staff member can change, suspend, remove, or transfer the master owner.
- The master owner can inspect, change, suspend, or revoke every delegated membership and invitation.
- Existing roles, job titles, and permission-denial templates remain separate concepts: job title (e.g. manager, cashier, stock manager) does not itself grant authority.
- All server-side RPCs must re-check the actor's current membership, branch grant, delegation grant, target role rank, and target branch inside the same transaction as the write. UI hiding is not an authorization control.

## Invitation and account setup

- Invitation carries business ID, branch scope, assigned role, job title, allowed permission set, inviter ID, expiry, and a single-use token hash.
- Invitation is shareable as a link; the link itself contains only a high-entropy opaque token, never role/branch details or personal data.
- Signup requires both email and mobile number, and the user creates their own password (minimum 8 characters, consistent with current policy).
- Login can use either verified email or verified mobile plus the same password.
- Both email and mobile ownership must be verified before membership activation. A mobile number supplied in a form is not proof of ownership; use an OTP or another trusted verification flow.
- Acceptance binds the invited identity to the verified mobile number and verified email. The token is single-use, expires, and can be revoked. Replays, mismatched identity, self-acceptance, revoked invitations, and expired invitations must fail.
- The invitation's role and scope are server-assigned; the invitee cannot edit them.

## Compatibility and migration constraints

- Current app has both legacy email invitation and newer mobile-invitation call paths; the database catalog inspected on staging exposed email-bound invitation functions and branch membership functions. The checked-in migration history does not yet prove a complete mobile-invitation schema/function definition.
- Do not replace the existing email invitation path until the mobile flow is implemented and tested end-to-end.
- Do not infer production schema from staging. Before implementation, compare the production catalog and migration history using read-only inspection, then write an additive migration against the verified schema.
- Do not alter or backfill existing memberships, branch grants, sales, stock, finance, customer, loyalty, or audit records as part of this feature.
- Do not grant global master-owner rights based only on matching an email string in client code. Provision the trusted owner mapping through a protected administrative process, with recovery/transfer controls.
- Preserve RLS. No service-role key in browser code. Security-definer functions must pin search_path, validate all arguments, and have least-privilege execute grants.
- Feature must remain off for normal users until the owner mapping and delegation model have been verified in a non-production environment.

## Suggested additive data model (subject to production catalog review)

- Protected platform-owner mapping: auth user ID, active status, created/approved metadata; unique active master owner policy (or explicit documented multi-owner policy).
- Manager delegation: business ID, manager user ID, branch ID, allowed role codes, allowed permission keys, granted by, revoked at, timestamps.
- Invitation extension: verified invitee mobile, branch scope, role code, job title, inviter, expiry, accepted/revoked timestamps, token hash.
- Audit events for owner appointments, delegation grants/revocations, invitation lifecycle, and member role/scope changes.

The final schema must fit existing `business_memberships`, `branch_memberships`, `business_invitations`, `roles`, and `branches` tables rather than duplicating membership or branch access state.

## Acceptance criteria

- The verified master owner can view and administer all businesses and branches.
- A manager sees and administers only explicitly assigned branches.
- A manager can share an invitation link for a team member within an assigned branch.
- A manager cannot invite into an unassigned branch or assign an undelegated role.
- A staff invite cannot be reused, accepted by a different verified phone/email, or accepted after expiry/revocation.
- New members set their own password; email and mobile are both verified; either verified identifier can be used for login.
- Existing memberships and branch grants retain their current effective access.
- Every sensitive action creates an audit record.
- RLS and server-side tests demonstrate that direct API/RPC calls cannot bypass the hierarchy.
