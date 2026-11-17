# BizSathi multi-role access — implementation audit

**Audit date:** 17 November 2026  
**Repository:** `auraluxenpj/bizsathi`  
**Audited code baseline:** `1531c859bbb542b7e73de067acbaa1f24b429470` (main)  
**Production Supabase project:** `efcxhbyaazfvpbaxyvpu`  
**Scope:** employee roles, permissions, business/branch boundaries, invitations, database enforcement and approval workflows.

## Executive result

The current application has a useful single-role foundation, branch membership controls, per-member denials, position templates, delegated invitations and several purpose-built approval workflows. It does **not** currently implement multiple roles per employee or business-defined custom access roles.

A direct replacement of `business_memberships.role_code` would be unsafe. That column currently participates in rank/authority checks, invitation rules, membership administration, and other database functions. The recommended migration is additive: introduce business-scoped access roles and role assignments, backfill one equivalent access role for each existing member, and retain the legacy membership columns during a compatibility period.

**No production data or schema was changed during this audit.**

## 1. Existing data model

| Object | Current purpose | Limitation |
|---|---|---|
| `roles` | Global fixed role catalog with rank (owner, admin, accountant, branch_manager, staff, viewer) | Not business-customizable; one role is stored on a membership |
| `business_memberships` | One row per user/business, including `role_code`, `job_title`, status | `role_code` is singular; `job_title` is also singular |
| `job_title_denials` | Global position defaults stored as denied permission keys | Position is coupled to effective access defaults |
| `business_role_templates` | Business-specific denied-permission overrides per job title | Customizes positions, not independent access roles |
| `member_permission_denials` | Per-member restrict-only permission rows | Supports denials, not multi-role grants |
| `branch_memberships` | Explicit user/business/branch grants | Correctly separate from position; must remain authoritative for branch scope |
| `delegation_grants` | Branch-scoped delegation and invitation limits | Its allowed role codes and rank checks assume the global role catalog |

Production database migration history confirms migrations 0071, 0072 and 0073 are present. The live production schema has RLS enabled on the core membership, branch, role, denial, delegation and position-template tables.

## 2. Existing application behavior

- `business_role_rank(business,user)` currently resolves one `business_memberships.role_code` through the global `roles` catalog.
- `has_business_role` and functions such as `set_branch_access`, `update_business_member` and `team_invite_authority` rely on that rank model.
- `can_access_branch` checks active business membership and an explicit `branch_memberships` row; business administrators retain their existing wider branch authority.
- Invitations store one `role_code` and one `job_title`. Acceptance creates the membership and branch assignment through protected RPCs.
- The UI has a position permission editor and a per-member denial checklist. The frontend permission catalogue and role/position presets are defined in TypeScript as well as represented in database data.
- The employee navigation is already grouped under HR & People Management, while Security has a separate navigation group.

### Important enforcement finding

The live definition of `public.has_permission(uuid,text)` was inspected. It checks the Branch Manager ceiling and `member_permission_denials`, but does not itself read `business_role_templates` or `job_title_denials`. The position-denial RPC supplies those restrictions to the UI. Therefore, the database-level enforcement of position-template denials is not centralized in the same helper that the write triggers call.

This needs to be resolved as part of the role-engine migration: effective permissions must be calculated in the database from assigned roles, then have explicit member denials applied. UI hiding must remain presentation only.

## 3. Approval workflow inventory

The database already contains purpose-built approval paths, including:
- Business archive requests and review.
- Inventory-count review and branch-scoped approval/confirmation.
- Sale-return approval queue.
- HR leave review and payroll approval.

These are not a configurable, universal approval policy engine. We should preserve these workflows and add business-configurable sensitive-action policies only where the actual write/posting handler can enforce a pending/approved state. A generic approval table without integration into the transaction RPCs would create a false sense of security and is not recommended.

## 4. Security and database observations

- Branch access and business membership are separate concepts and must stay separate.
- Role/permission mutation must remain inside authenticated, server-validated database functions. No browser-supplied role rank or permission grants can be trusted.
- New tenant tables must have RLS enabled, direct grants revoked, and only least-privilege access through guarded RPCs.
- Every `SECURITY DEFINER` function must pin `search_path`, validate `auth.uid()`, validate business membership and target rank, and have explicit EXECUTE grants.
- The Supabase security advisor reports RLS-enabled tables with no direct policies (including position templates and inventory-count tables), which can be intentional when direct table grants are revoked and access is through guarded RPCs. It also reports the existing anonymous invitation-preview function and many authenticated SECURITY DEFINER functions; these require function-by-function authorization review rather than blanket removal of EXECUTE.
- The advisor also reports leaked-password protection disabled. This is an account-level Auth setting, not a code migration.
- The performance advisor reports repeated auth-function evaluation in some RLS policies and multiple permissive policies on several HR/audit tables. These are optimization findings, not proof of an authorization bypass.

## 5. Target architecture

1. **Position** remains an HR designation only; it never grants access by itself.
2. **Business access role** is a business-scoped role template with a name, description, active status and authority ceiling.
3. **Role permissions** are explicit grants from the central permission catalogue.
4. **Employee role assignments** are many-to-many and scoped to one business.
5. **Effective permissions** are the union of active assigned-role grants, intersected with the employee's business/branch scope; explicit member denials always win.
6. **Authority/rank** is the highest authorized rank among assigned roles, but custom roles cannot grant owner/platform-owner authority or bypass protected owner operations.
7. **Branch access** continues to be controlled by `branch_memberships` and operation-specific branch checks. A role grant never creates branch membership.
8. **Sensitive approvals** are business-configurable, with branch scope where relevant, separation of requester and approver, immutable decision/audit history, and enforcement inside the final posting RPC.

## 6. Safe implementation sequence

### Phase A — additive data model and compatibility backfill
- Add business-scoped role definitions, role-permission grants and member-role assignments.
- Backfill exactly one equivalent access role for every existing active membership, using its current role and position-derived effective defaults.
- Keep `business_memberships.role_code`, `job_title`, `business_role_templates`, `member_permission_denials` and `branch_memberships` intact.
- Validate assignment counts and permission equivalence before enabling the new resolver.

### Phase B — database authorization cutover
- Update the central permission resolver and rank/role helpers to use the new role assignments.
- Preserve the legacy membership role as a compatibility floor during rollout, but never let a custom role elevate a user to owner/admin rank.
- Update invitation, assignment, delegation and member-management RPCs.
- Keep explicit member denials higher priority than every role grant.
- Verify every posting/write path that relies on `has_permission`, not only UI buttons.

### Phase C — configurable sensitive approvals
- Preserve existing archive, inventory, sale-return, leave and payroll workflows.
- Add business-level policies for supported sensitive actions and integrate each policy with the actual database posting handler.
- Enforce no self-approval for actions that require independent review; record requester, approver, timestamps, decision and reason.
- Do not silently convert ordinary sales/purchases into approval queues.

### Phase D — user interface
- Add HR & People Management → Employees, Positions, Roles & Permissions, Employee Access.
- Add a role builder with module/action permissions.
- Allow multiple roles per employee and show effective permissions by business.
- Keep branch assignments in the branch-access control.
- Keep Settings & Security separate for access logs and security review.

### Phase E — verification and rollout
- Run migration and SQL security tests on staging first.
- Test legacy permission equivalence, multi-role union, explicit-denial precedence, rank escalation, invitation acceptance, branch isolation, inactive membership, and sensitive-action approval.
- Run unit tests, lint, production build and Supabase security/performance advisors.
- Compare pre/post membership, branch-grant and effective-permission counts.
- Only then schedule production migration. No production schema changes should be applied from an unverified PR.

## 7. Acceptance criteria

- Existing users can sign in without role or branch changes.
- Every pre-existing membership retains at least its previous effective permissions and no additional permissions without an explicit role assignment.
- A user can hold multiple roles in the same business.
- Custom roles are isolated to their business and cannot be assigned above the actor's authority.
- Denials override grants.
- A role does not create access to an unassigned branch.
- Sensitive actions cannot be completed by bypassing the approval workflow through a direct RPC or table write.
- All access and approval changes are auditable.

## Audit status

**Audit completed for the role/permission/branch/approval subsystem. Implementation has not yet been cut over.** The next code change must be an additive migration plus compatibility tests; production data and schema remain untouched.


### Permission catalogue drift

A comparison of the live `member_permission_denials_permission_check` constraint with `src/lib/permissions.ts` found HR permission keys used by the application but absent from the database constraint, including `hr.self.view`, `hr.attendance.view`, `hr.leave.create`, `hr.leave.view` and `hr.shifts.view`. This can cause permission-denial writes for those keys to fail at the database boundary. The new permission catalogue migration must reconcile the complete canonical list before role assignments are enabled.


## 8. Implementation prepared in the feature branch

The implementation now prepared in this branch includes:
- Additive business-scoped role definitions, role-permission grants and many-to-many employee role assignments.
- A canonical permission catalogue aligned with the application permission list; the missing HR permission keys in the legacy denial constraint are included.
- One compatibility default role assignment for each existing membership, without deleting or rewriting membership, position, personal-denial or branch-membership rows.
- Role creation, role editing, role assignment and role removal through guarded RPCs; custom permission roles are rank 1 and cannot elevate business authority.
- Effective permission resolution as the union of assigned role grants, with explicit employee denials taking precedence.
- Business authority rank derived from the maximum of the existing membership rank and assigned built-in role ranks.
- Position changes separated from access-role changes.
- Branch access continues to require an explicit branch membership. The Branch Manager count-approval guard now checks assigned access roles rather than relying on the HR title.
- An admin UI for custom roles, permission selection and multiple role assignments per employee.
- Existing sensitive-action approval workflows are retained; the inventory-count approval guard is role-aware. No generic approval queue is introduced without wiring it into each final posting RPC.

### Staging validation

Migrations 0074–0079 were applied to the separate staging Supabase project. A transactional SQL regression script passed there, covering:
- Default role backfill and custom role creation/editing.
- Multiple role assignment and union of permissions.
- Explicit denial precedence.
- No authority elevation from custom permission roles.
- Built-in role authority rank.
- HR designation changes not silently changing access roles.
- Branch isolation and Branch Manager inventory-count approval.
- Removal of additional roles while retaining the default assignment.

The SQL fixture transaction was rolled back; no test employees or businesses were retained. Production Supabase was not modified.

## Final rollout gate

The PR must pass the repository's unit/component tests, ESLint, production build and isolated SQL migration/security workflow. Only after that should the migration be applied to production, followed by the Lovable deployment when hosting credits are available. The app code must not be deployed before the production migration is applied.
