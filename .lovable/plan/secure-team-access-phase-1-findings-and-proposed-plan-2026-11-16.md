# Secure Team Access — Phase 1 Findings and Proposed Plan

## Scope confirmed
- Keep BizSathi exclusively for Auraluxe and its branches.
- Support email or mobile number with the same account password, replacing the earlier OTP-only requirement.
- Preserve existing accounts, memberships, stock, billing, accounting, loyalty and reports.
- This phase is an audit only. No application behaviour, database, authentication settings, DNS or production changes were made.

## What already exists and can be reused
- Existing profiles, business and branch memberships, ranked roles, job titles, restrict-only permissions and audit logs.
- Existing mobile-bound staff invitations and staff/branch administration screens.
- Live platform-owner, branch-delegation, multi-use team-invitation and invitation-use structures, plus protected creation, revocation and acceptance operations. These are already installed; do not recreate them.
- Team tokens are generated using 256-bit randomness, stored as SHA-256 hashes and returned once in URL fragments.
- Acceptance checks email and phone confirmation, locks the invitation row, checks expiry/revocation/usage, rechecks inviter authority, and records acceptance.
- Password sign-in already presents one email/mobile field. Mobile password authentication resolves the email on the server; its lookup is unavailable to anonymous and ordinary authenticated callers. Mobile failures have account/IP throttling.
- RLS is enabled on every reviewed access table. Membership and team writes use protected database operations rather than ordinary browser writes.

## Verified gaps
1. **Master-owner authority is not activated.** The designated email has one existing Auth account, but there are zero active platform-owner bindings. Protection operations exist but do not protect that account as platform master owner yet.
2. **Team links currently lead to a missing page.** Team creation returns `/join#token=…`; `/join` renders 404. The Team & Access Management screen is absent and its server operations are not connected to the current staff interface.
3. **Signup cannot complete the required verification flow.** It lacks full name and password confirmation; mobile is saved as editable signup metadata, not linked and verified as the Auth phone. The team-acceptance operation correctly refuses unverified phones, leaving no complete UI path to acceptance.
4. **Phone identity is not yet trustworthy for password lookup.** The existing lookup uses the self-editable profile phone, not exclusively the verified Auth phone. It must use a verified same-account identity, with legacy account recovery preserved. Current normalization strips Nepal country codes to ten digits rather than retaining E.164.
5. **Master-owner access is incomplete across application layers.** Business lists explicitly filter to the caller's membership rows; page controls use local role/permission data. The permission operation has no explicit platform-owner exception, so denial rows could still limit a master owner despite elevated database rank.
6. **Delegation needs stronger permission and concurrency checks.** The authority helper validates grants and branch membership, but does not require each delegated target rank to be below the delegate's own rank. Creation checks explicit denial rows rather than every effective job-title/template restriction. Acceptance rechecks role/branch authority but does not re-evaluate all changed denial/limit settings or lock delegation evidence against concurrent revocation. Harden these without replacing the role system.
7. **Audit and member information are incomplete.** Creation, acceptance and revocation are logged, but actual invitation sharing is not recorded. Current staff lists lack the full requested invitation source, email, verified-phone status and available last-login data.
8. **Legacy business records must remain untouched.** Live counts show two business records, one branch and three memberships. Retaining Auraluxe-only operation must not delete or expose the other historical business record.

## Checks performed
- Read-only inspection of live owner bindings, role/permission operations, team acceptance, policies, grants and protection triggers.
- All **539 existing tests across 70 files passed**; current preview build is OK.
- Browser check: email/mobile password sign-in fields render; `/join` returns the not-found screen; no browser exceptions during those checks.
- Existing SQL security tests were inspected but **not executed against production**. Their cases are not a concurrent acceptance test and do not establish production readiness.
- Successful email/mobile login, dual-contact verification, SMS delivery and hosted authentication settings remain unverified. Custom sender-domain verification was pending at the earlier email status check.

## Proposed implementation phases after approval

### Phase 2 — Safety design and isolated test baseline
- Reuse the installed access structures and document additive, targeted changes rather than replaying migration 0042.
- Resolve the designated owner's existing Auth UUID from trusted account records and define a protected binding scoped to Auraluxe.
- Establish isolated tests for owner protection, effective permissions, cross-branch delegation, verification, concurrent acceptance/revocation and legacy account preservation.
- Confirm hosted email/password and SMS verification capabilities before changing sign-in or signup settings. Do not silently auto-confirm contacts.

### Phase 3 — Owner protection and delegation hardening
- Activate the approved UUID binding; cover page access, list queries, effective permissions and protected administrative operations.
- Keep role ceilings, require effective delegation permission, forbid above-authority assignments and serialize authority changes with acceptance.
- Review existing policies and operations for owner bypass compatibility and branch isolation. Preserve ordinary tenant authorization.

### Phase 4 — Complete invitation flow
- Add the public team-link preview/acceptance page and preserve legacy mobile-bound invitation links.
- Reuse hashed tokens, existing usage records, expiry, revocation and atomic acceptance; record share actions accurately without claiming delivery.
- Reuse registered permission keys; do not introduce a parallel role or permission system.

### Phases 5–6 — Verified signup and same-account password login
- Reuse profiles; collect full name, email, E.164 phone, password and confirmation.
- Verify email and attach/verify phone on the same Auth UUID using supported methods before granting new invitation access.
- Base mobile-password lookup on verified Auth identity, with generic errors and rate limits; retain existing account access through reviewed linking/recovery.
- Keep confirmation and recovery emails on Lovable's managed email infrastructure. No email queues or email tables.

### Phase 7 — Team & Access Management
- Extend existing Settings/staff screens with Members, Invitations, Roles & Permissions, Branch Access, Delegation and Activity.
- Show only authorized actions and branch choices, invitation status/usage, joined members and safely authorized identity information.
- Preserve the current BizSathi UI on desktop and mobile.

### Phase 8 — Verification
- Run existing regression tests plus isolated security and real concurrent tests.
- Verify approved owner, manager and employee paths end-to-end, including actual email and SMS verification when available.
- Confirm preserved business-record counts and POS/report access; report remaining limitations honestly.
- Report changed files, database changes, security effects and executed tests after each phase. Do not publish automatically.

## Technical constraints
- Use existing authenticated TanStack server functions and database operations; do not add Edge Functions or expose privileged keys.
- Any new migration must be additive, least-privilege, RLS-protected and reviewed before application. Avoid new tables where existing equivalents suffice.
- No production data deletion, account resets, financial mutations, synthetic live transactions or automatic deployment.