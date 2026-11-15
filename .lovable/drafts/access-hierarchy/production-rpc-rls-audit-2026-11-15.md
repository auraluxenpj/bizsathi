# Production RPC and RLS audit — 2026-11-15

Status: read-only inspection of the live BizSathi Lovable Cloud database and current main application source. No production rows, policies, functions, memberships, invitations, permissions, or deployments were changed.

## Merge verification

Design PR #20 was merged as `150e70aa25494b1d16ce49cc55f8b963dcca47c4`. On that commit, Supabase Preview and Tests/lint/production build checks both completed successfully. The Lovable project reports the same latest commit and project status Ready. The merged PR contains documentation only; it does not implement the hierarchy.

## Relevant live functions and grants

The following live function definitions were inspected with `pg_get_functiondef`, including their ACLs:

- `create_business_invitation_v2(uuid,text,text,text,text)`: authenticated callers can execute; it maps job title to a role and requires business role rank >= 80. It accepts a mobile number but no branch scope or delegation allow-list.
- `accept_business_invitation(text)`: authenticated callers can execute; it requires a verified email only when the invitation has email, or a matching profile mobile when email is null. It does not verify both identities or require mobile OTP proof. It creates a business membership but no branch grant.
- `set_branch_access(uuid,uuid,uuid,boolean)`: authenticated callers can execute; requires rank >= 80 and a lower-ranked target member. It is not scoped by a manager delegation record.
- `revoke_business_invitation`, `reissue_invitation`, `change_invitation_role`, `set_invitation_job_title`, `set_member_permissions`: current authorization is based on business role rank/admin checks, not a branch-scoped delegation grant.
- `business_role_rank`, `has_business_role`, `has_permission`, and `can_access_branch` are security-definer helpers with pinned public search_path. Their live definitions were inspected.

The relevant security-definer functions are owned by postgres. The returned ACLs generally grant authenticated execution for invitation and branch-management RPCs and service_role execution. The final migration must explicitly set least-privilege grants for every new/replaced function.

## RLS findings

Live policies currently show:

- `business_invitations`: SELECT only for business admins.
- `branch_memberships`: SELECT for business admins or the member's own grants.
- `branches`: SELECT for business admins or users passing `can_access_branch`; INSERT/UPDATE require business admin.
- `business_memberships`: SELECT for business members.
- `member_permission_denials`: SELECT for self or business admins.
- `businesses`: SELECT for business members; UPDATE requires business admin.
- `profiles`: SELECT for self or users sharing a business; UPDATE for self.

There is no branch-manager invitation visibility policy or explicit delegation table/policy in the inspected schema.

## App source findings

At the merged main commit:

- Email and mobile invitation server functions both require `has_business_role(..., 'admin')`.
- Mobile invitation calls `create_business_invitation_v2`.
- The acceptance server function calls `accept_business_invitation`.
- Branch access calls `set_branch_access`.
- Mobile/password login uses a server-only mobile-to-email lookup followed by Supabase password sign-in.
- `manager` maps to the `accountant` security role; the job title is not a delegation capability.

The checked-in Drizzle migration history contains the original email invitation and branch-access foundation, mobile profile normalization, and mobile/password login. It does not contain the live `create_business_invitation_v2` definition or a mobile OTP verification/acceptance contract. The live database has therefore drifted from what can be reconstructed from the checked-in migrations alone.

## Required implementation changes

1. Resolve the authoritative migration/change history for the live `create_business_invitation_v2` and related live functions before writing a replacement migration.
2. Introduce a protected platform-owner identity mapping keyed to the immutable authenticated user ID; do not authorize by browser-supplied email.
3. Add explicit manager delegation records for business, branch, permitted roles/permissions, grantor, timestamps and revocation.
4. Extend invitations with immutable server-assigned branch scope and delegated role/permission data.
5. Make create, accept, revoke, role-change and branch-grant RPCs verify current actor identity, branch grant, delegation allow-list, role rank and business ownership atomically.
6. Acceptance must prove both email and mobile ownership, including a trusted mobile OTP verification record; current mobile/password login is not proof that the phone was verified.
7. Update RLS so managers can see and administer only invitations, memberships and branches within their current delegated scope.
8. Preserve existing memberships, branch grants, POS, stock, sales, finance, customer memberships and loyalty records. Keep legacy invitation paths until the new flow passes isolated staging regression tests.

## Gate / current safety status

- Production inspection only; no production mutation.
- No platform-owner privilege has been provisioned.
- No new migration has been applied to production or staging.
- Implementation is blocked until the authoritative migration history and mobile OTP verification contract are reconciled.
- Next safe step: recover the missing live change history and verify the staging auth/OTP path, then implement the additive schema and RPC changes on a separate branch and test with staging-only fixtures.
