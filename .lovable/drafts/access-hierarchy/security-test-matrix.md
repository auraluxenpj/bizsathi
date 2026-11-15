# Master-owner and branch-delegation security test matrix

This is a test contract. No production data or permissions are modified by this file.

| Scenario | Expected result |
|---|---|
| Verified master owner opens any business | Full authorized view across businesses and branches |
| Non-owner submits the master owner's email in a request | Denied; identity must come from authenticated server context and protected owner mapping |
| Master owner appoints manager for Branch A | Grant succeeds and is audited |
| Manager lists assigned branches | Branch A only |
| Manager attempts to list Branch B without a grant | Denied by server/RLS |
| Manager invites cashier to Branch A with delegated cashier role | Invitation created and auditable |
| Manager invites accountant without accountant delegation | Denied |
| Manager invites user to Branch B without Branch B grant | Denied |
| Manager attempts to appoint another manager without explicit delegation | Denied |
| Manager tries to grant a role equal to or above their authority | Denied |
| Manager changes or removes master owner | Denied |
| Staff member calls invitation RPC directly | Denied |
| Invitee changes role or branch in client payload | Server ignores/rejects; stored invitation scope is authoritative |
| Invite link accepted with wrong mobile | Denied |
| Invite link accepted before email and mobile verification | Denied |
| Valid invite accepted with both identities verified | Membership and branch scope created exactly as invited |
| Same invitation accepted twice | Second attempt denied |
| Expired or revoked invitation accepted | Denied |
| Invitation link token reused by another account | Denied |
| Existing email invitation remains valid during staged rollout | Existing behavior preserved until migration cutover |
| Existing member role/branch grants after migration | Effective access unchanged |
| Direct query bypassing UI | RLS and RPC authorization still deny unauthorized reads/writes |
| Manager delegation revoked | Subsequent manager actions denied; existing team memberships handled according to owner-selected revocation policy |
| Audit records | Actor, target, business, branch, action, timestamp and outcome recorded |

## Required test layers

1. Pure unit tests for role rank, delegated role allow-list, branch scope, and invitation state transitions.
2. Database tests against an isolated Supabase project with separate owner, two managers, and staff users.
3. RLS tests for cross-business and cross-branch read/write attempts.
4. RPC tests for direct invocation (not just UI flows).
5. Signup/login tests covering email verification, mobile OTP verification, email login, and mobile login.
6. Regression tests proving existing memberships, branch grants, permissions, POS, inventory, sales, customer memberships, and loyalty behavior remain unchanged.

## Rollout gates

- Production schema and migration history reviewed read-only.
- Additive migration applied only to isolated staging.
- Seeded staging fixtures prove positive and negative cases.
- CI passes.
- Owner reviews the pull request and explicitly approves merge.
- Production migration and publication require separate explicit approval.
