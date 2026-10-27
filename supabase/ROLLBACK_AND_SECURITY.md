# BizSathi Nepal — database foundation

## Migrations
1. `0000` — roles, profiles, businesses, business_memberships, branches, financial_periods, business_settings, audit_logs; RLS, helpers, triggers, privileged functions.
2. `0001` — resets table privileges to least privilege (removes platform default grants).
3. `0002_security_review_workspace` — optional avatar URL and append-only, administrator-only tenant review events.
4. `0003_business_access_foundation` — email-bound hashed invitations, branch memberships, narrowly granted RPCs, branch read restrictions, and fail-closed membership removal.

## Running the tests
Run `supabase/tests/tenant_isolation.sql` as a privileged SQL user. It creates synthetic users, runs all checks, then aborts on purpose.
**Pass = error `ALL TESTS PASSED`.** Any other error names the failing test. Nothing is kept.

Covers: atomic business creation, two-business isolation (all 7 tables), cross-tenant writes, tenant move, outsider/self-join, staff self-promotion, owner/admin grant limits, owner removal, closed-period protection, business/audit deletion, anonymous access.

## Security review — readable role labels
- **Scan:** Quick backend security scan completed on 2026-10-27 at 04:06:43 UTC.
- **Warning:** “Any signed-in user can read every record in roles.” The scanner classified this as error-level `RLS_EXPOSURE` because `roles_read` permits authenticated SELECT with `using: true`.
- **Finding reference:** scanner `lov_pgscan`; ID `lov_db_rls_tautology_permissive_v1_60fb38a4e32a9161`.
- **Impact:** Any signed-in account, including one without a business membership, can read the shared role catalogue (`code`, `name`, `rank`, `description`). This reveals role labels and hierarchy, not users’ assigned roles, memberships, profiles, or private tenant records. Anonymous reads and authenticated INSERT, UPDATE, and DELETE remain denied. Reading a rank does not grant that rank: authorization still derives from trusted business membership records.
- **Assessment:** Intentional read-only reference data, not a tenant-data exposure or privilege-escalation path under the current schema. Keep private or business-specific information out of this catalogue; reconsider the policy and dismissal if its contents or access rules change.
- **Approval decision:** The user approved dismissing this specific warning through the security approval card on 2026-10-27. The finding-management tool confirmed the dismissal and reported no remaining active findings at that point. No database policy or grant was relaxed or changed by the dismissal; it suppresses the warning rather than fixing or removing the readable-label policy.
- **Approved rationale:** “This table contains only shared role names and ranks, not anyone’s assigned permissions or private business data, and users cannot change it.”
- **Review scope:** The deeper code-level security scan was pending when the dismissal was recorded. It completed at 2026-10-27 04:09:39 UTC with no findings for the scanned version; results were marked outdated for the current project. Neither the dismissal nor that scan establishes that subsequent application changes are free of security issues.

## Security workspace review — 2026-10-27
- Signed-in active business owners and administrators can read and append tenant review events. Server AI calls also verify administrator membership through trusted database records; ordinary reads and writes retain RLS.
- Findings, report updates, AI analyses, warning dispositions, and approvals are separate immutable events. Recorded approval decisions do not automatically dismiss scanner warnings or change permissions. Cross-tenant event links are rejected by a composite foreign key. Actor and timestamp are database-generated for ordinary application inserts.
- Existing project evidence is displayed as labeled historical reference records after administrator authorization, not attributed as new tenant approvals. The original approval has date-only precision.
- AI uses Lovable Gateway `openai/gpt-6-astra` via Responses with streaming on the gateway leg, strict structured output, no automatic retries, and persisted per-business access pauses. Prompts and credentials remain server-only. Advice is not an approval or verified fix.
- Validation: seven targeted unit/routing tests passed; database columns and administrator RLS were read back; signed-out protected-history navigation redirected to sign-in with no page errors or small-screen horizontal overflow. A real gateway request returned an informational assessment and prioritized steps for non-private role-label evidence.
- **Not yet verified:** signed-in end-to-end submission, AI persistence/read-back, profile save, and decision recording. Session minting reported no auth users. No real business or account data was inserted. A signed-up user with an active owner/admin business membership is needed to finish these checks. New-table live two-business mutation tests also remain to be run with a privileged transactional test connection.
- **Manual review:** AI processing sends administrator-supplied evidence to Lovable AI; do not include credentials or personal financial records. Confirm retention requirements before sensitive use. This update has not received a new deep scan.

## Recovery
- **Phase 1 recovery:** roll forward to repair invitation/branch RPCs. Do not broaden branch policies to work around missing grants; assign legitimate branch access. Preserve existing memberships and audit history. The legacy empty-database teardown below predates the invitation/branch additions and is not a complete current teardown procedure; do not run it against a live business.
- **Prefer roll-forward**: write a new migration that fixes the issue. Never edit applied migrations.
- **Restore**: use a point-in-time backup from the Cloud panel when data is damaged.
- **Full teardown (empty database only — destroys everything):**
```sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.create_business(text,text,text), public.add_business_member(uuid,uuid,text),
  public.update_business_member(uuid,uuid,text,text), public.remove_business_member(uuid,uuid),
  public.transfer_business_ownership(uuid,uuid), public.set_financial_period_status(uuid,text),
  public.archive_business(uuid), public.handle_new_user() CASCADE;
DROP TABLE IF EXISTS public.security_review_events, public.audit_logs, public.business_settings, public.financial_periods, public.branches,
  public.business_memberships, public.businesses, public.profiles, public.roles CASCADE;
DROP FUNCTION IF EXISTS public.write_audit(uuid,text,text,text,jsonb,jsonb), public.audit_row(),
  public.guard_closed_period(), public.block_mutation(), public.prevent_tenant_change(), public.touch_updated_at(),
  public.shares_business_with(uuid), public.has_business_role(uuid,text), public.is_business_member(uuid),
  public.business_role_rank(uuid,uuid);
```
Audit logs block DELETE/TRUNCATE by trigger; `DROP TABLE` is the only removal path, by design.

## Needs manual review
1. `business_memberships.user_id` uses ON DELETE RESTRICT: deleting a sign-in account that still has memberships fails. Decide on an offboarding flow.
2. `add_business_member` still takes a user id; the app instead offers verified-email-bound invitations. Invitations are shareable links, not automatically emailed, and stored tokens are hashes only. Existing membership retries are rejected rather than silently changing roles.
3. Security linter flags 10 signed-in-callable SECURITY DEFINER functions — intended RPCs/helpers, each checks `auth.uid()` and DB role rank. Review on every change.
4. `audit_logs` stores full row snapshots (may include PAN/VAT). Confirm retention policy.
5. Owner can transfer ownership; no second-factor or delay.
6. Service-role code bypasses all RLS — keep it server-side only.
7. Future posted-transaction tables must reference `financial_periods` with ON DELETE RESTRICT and block edits when the period is closed.

## Phase 1 implementation and verification — 2026-10-27

- Added `/businesses` for registration through the existing atomic `create_business`, authorized branch lists/creation, staff invitations, role changes, suspension/restoration, and explicit branch grants. Kept the existing security workspace and public URLs.
- Added email/password signup and sign-in, forgot-password form and public `/reset-password`. Email sign-in was enabled with the hosted tool; other signup/confirmation/password policy settings were left unchanged and not independently read back. Actual email delivery and full recovery-link completion remain unverified. Never disable confirmation to bypass an email test.
- Invitations are bound to the verified account email; acceptance checks current inviter authority, expiration/revocation/replay, disallows owner and equal/higher ranks, and atomically inserts membership plus marks acceptance. Raw 256-bit secrets are returned once for manual sharing, placed in URL fragments, stored only in session storage during sign-in, and not persisted in the database or audit logs. No new email service or paid integration was added.
- Branch managers retain manager-wide access; lower roles require explicit grants. Future branch-scoped financial/stock policies must use `can_access_branch` plus role-specific write authorization. A branch grant is not permission to bill or post accounts.
- Fixed a genuine NULL-authorization issue in `remove_business_member`: a caller without membership could previously reach deletion of a lower-role member because `IF NOT(NULL)` did not reject it. It now fails closed and removes branch grants before authorized membership removal. This correction is verified by an outsider-removal test.
- Added explicit trusted administrator checks to finding, decision, and AI-resume server mutations. Specified the exact business foreign key in both business list queries after browser testing exposed ambiguous relationship errors.
- **Executed:** 13 unit/routing tests passed. Applied all four project migrations to a separate local PostgreSQL 17 database with a minimal auth harness. `tenant_isolation.sql` emitted its deliberate `ALL TESTS PASSED` rollback marker; `business_access.sql` emitted `BUSINESS ACCESS TESTS PASSED`. Confirmed zero synthetic users, businesses, and review events remained afterward.
- **New isolated tests cover:** cross-business history reads/appends and invitation reads; no implicit staff branch visibility; no staff self-grants/approval writes; cross-business branch grants/IDs; NULL caller rank removal; owner/equal-rank invitation denial; correct verified-email acceptance; mismatched email, replay, demoted inviter, revoked/expired links, anonymous acceptance.
- **Browser checks:** authenticated real-account empty business registration screen loaded without list errors; no-admin security state rendered; invalid invitation returned a denial; account-recovery form rendered; 393×732 business page had no horizontal overflow; no page errors. Latest automatic app check was successful.
- **Live read-back:** invitation/branch tables and policies exist; anonymous branch-grant reads, direct authenticated invitation writes, and authenticated token-hash reads are denied. Business, membership, invitation, and review-event counts stayed zero.
- **Still unverified:** successful real-account registration and manager/staff UI flows, security saves/AI read-back, recovery-email completion, concurrent invitation acceptance/ownership race tests, hosted redirect allowlist, and a fresh dependency/deep-security scan. Do not create dummy live businesses or users for these tests. Real business details and mail-link participation are needed; later phases remain unapproved.

### Reproducing isolated SQL tests

Use a disposable PostgreSQL database, never the connected live business database. Supply `anon`, `authenticated`, and `service_role` roles, `auth`/`extensions` schemas, a minimal `auth.users` fixture with the columns used by the tests, and `auth.uid()` reading the `sub` field from `request.jwt.claims`. Grant schema use and auth helper execution to test roles. Apply existing migration SQL in order, then run both files under `supabase/tests/`. The final deliberate exceptions are success markers; any other error is a failure. This harness checks SQL behavior and isolation, not hosted OAuth or email delivery.
