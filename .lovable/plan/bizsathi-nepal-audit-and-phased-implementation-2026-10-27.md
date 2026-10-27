# BizSathi Nepal: audit and phased implementation

## 1. Existing pages and working modules

The project is currently a security-review workspace, not yet a complete business-management app.

- `/` and `/auth`: Google and Lovable sign-in, with sign-out support.
- `/security`: administrator findings and AI impact/remediation summaries.
- `/security-history`: report updates, warning dispositions, approval decisions, and history.
- `/profile`: name, phone, and avatar URL.
- Existing tenant-security foundation, audit history, and server-side AI integration will be reused.

**Checked in this audit:** public sign-in rendered; signed-out visits to all three protected pages redirected to `/auth`; no browser page errors appeared. The existing focused tests ran: **7 passed**. These do not establish complete signed-in or database isolation coverage.

## 2. Existing database and relationships

Live inspection confirmed nine existing tables, all with row-level security enabled:

| Table | Purpose and relationships |
| --- | --- |
| `profiles` | Account name, phone, avatar; references the authentication account. |
| `roles` | Trusted owner/admin/accountant/staff/viewer hierarchy and ranks. |
| `businesses` | Business identity; creator references a profile. |
| `business_memberships` | Business + profile + role; unique membership per business/user. |
| `branches` | Belongs to a business; branch codes unique within each business. |
| `business_settings` | One settings record per business; currency, calendar, VAT, fiscal settings. |
| `financial_periods` | Business periods; overlapping periods prevented; closed-period protection. |
| `audit_logs` | Append-only business audit trail. |
| `security_review_events` | Append-only findings, analyses, and decisions; related events constrained to the same business. |

Business-linked history uses deletion restrictions. Membership/profile links and uniqueness constraints already exist. No replacement tables are needed for these foundations.

**Current counts:** one authentication account, zero businesses, zero memberships, zero security-review events. No business records or sample transactions were created during this audit.

## 3. Authentication and permissions

- Sign-in and logout are implemented. Current hosted provider, signup, and password-recovery settings were not independently verified in this audit.
- Protected pages require sign-in; sensitive reads use server authentication and database policies.
- Tenant access derives from trusted memberships and role ranks. Privileged business creation, membership changes, ownership transfer, and period changes already have database functions.
- Anonymous table reads and direct signed-in deletes are denied on all nine tables. Membership changes are not direct table writes.
- Business creation and initial owner assignment already have an atomic database operation, but no registration screen.
- Missing: password sign-in/recovery screens, staff invitations and acceptance, business onboarding, usable staff administration, and branch-specific authorization.
- Current branch access is business-wide membership, not a separate per-user branch grant. This must be addressed before branch-restricted operations.

## 4. Security gaps and remaining verification

1. **No administrator business membership exists**, so signed-in finding saves, approvals, profile saves, and AI persistence/read-back remain unverified end-to-end. Do not manufacture a real business to remove this blocker.
2. The original two-business isolation tests have historical passing evidence; they were **not rerun in this audit**. New review-event mutation/isolation tests still need an isolated privileged test environment.
3. Some security-review mutation functions rely on administrator RLS rather than an additional explicit administrator check. This is not an established bypass, but consistent server checks and adversarial tests are needed.
4. The readable-role-label warning was intentionally dismissed with approval: authenticated users can read reference labels/ranks, not gain permissions. The disposition is documented; authorization must continue to use trusted membership records.
5. Prior dependency warnings remain unresolved; no fresh dependency scan was performed here. Earlier deep-scan evidence is version-specific, not current certification.
6. Privileged functions, concurrent ownership changes, offboarding, audit-data retention/privacy, and high-impact action confirmation require continued review.
7. Existing VAT/fiscal defaults and the nine-digit PAN/VAT constraint are implementation assumptions, not validated Nepal legal requirements. Validate before production and avoid presenting them as legal guidance.

No app code, schema, production deployment, domains, or AURALUXE content was changed by this audit.

## 5. Missing business features

The dashboard, product catalogue/variants, stock ledger, customers, suppliers, purchases, sales/POS, payments, cash reconciliation, expenses, double-entry accounting, financial reports, CSV tools, and offline queue are not implemented.

There are no current sales/accounting records from which to calculate dashboard figures. Empty states must say no activity or not yet available; never show fabricated revenue, profit, stock, or balances.

## 6. Smallest phased implementation

Approve the direction below, then implement **Phase 1 only** and stop for review before Phase 2. Do not build all phases in one change.

| Phase | Smallest deliverable and verification gate | Relative Lovable credit impact |
| --- | --- | --- |
| 1 — Finish foundation | Reuse existing sign-in/security pages. Add business onboarding through the existing atomic operation; complete password recovery, staff invitations, role administration, and branch-access rules as needed. Verify auth settings, explicit privileged checks, and isolation in a separate test environment. Preserve existing security history. | Low–medium; additional verification may be medium. |
| 2 — App shell and dashboard | Shared desktop/mobile navigation and business/branch selection. Dashboard uses only real available records and clearly unavailable/empty metrics; activate financial calculations as underlying modules arrive. Verify access and mobile layout. | Low–medium. |
| 3 — Master data and inventory | Add only missing product/variant, party, and stock-ledger structures. Opening stock, adjustments, receiving, transfers, low-stock and CSV flows with traceable references. Verify stock consistency and tenant/branch isolation. | Medium–high. |
| 4 — Sales, purchases and POS | Sales and purchase documents, returns, payment allocation, receipts, cashier/counter reconciliation, and idempotent stock/payment posting. Verify complete financial flows and permission boundaries. | High. |
| 5 — Accounting and reports | Chart of accounts, balanced journals, posting/reversal controls, ledgers, ageing, trial balance, profit/loss, balance sheet, cash flow and tax summaries. Integrate earlier operational records through controlled accounting posting. | High; accounting validation is essential. |
| 6 — Offline POS | Authorized device cache, durable local sale queue, unique IDs, explicit pending/confirmed/failed states, conflict handling, and reconnect synchronization. Never silently discard sales. | High. |
| 7 — Final verification | Mobile usability, permissions, cross-business/branch isolation, balanced accounting, stock consistency, retries/conflicts, exports, and recovery. Each earlier phase also gets its own tests before proceeding. | Medium–high. |

These are qualitative estimates, not guaranteed credit totals. Use existing Cloud infrastructure; add no paid integration or unnecessary package without a demonstrated need and approval. No automatic production deployment.

### Technical approach

Reuse the current TanStack app, components, Cloud clients, trusted membership functions, security workspace, and audit foundation. Add schema only for genuinely missing modules using additive migrations, least-privilege grants, tenant RLS, and server-validated writes. Separate stock movements and immutable posted accounting from editable drafts. Define posting contracts before POS financial writes, even though full accounting screens arrive in Phase 5. Record any new structural decisions only when their phase is approved.

## 7. Genuine offline multi-device billing

Single-device offline billing can use browser-local storage and synchronize with Cloud when internet returns, subject to device access, storage durability, and shared-device privacy controls.

**Multiple disconnected counters cannot share state through Cloud while offline.** Reliable local coordination requires a working LAN/Wi-Fi network plus an always-on local coordinator (for example a shop computer/local appliance) and an authenticated local service. It also needs device enrollment, durable storage, ordering/conflict rules, and a supported browser-to-local connection or installed client. Hardware, maintenance, and local deployment are additional infrastructure outside the current hosted app and require approval.

Without that service, counters can queue independently, but stock conflicts remain possible until reconnect; cross-device offline synchronization must not be promised.

## Approval boundary

Approve Phase 1 before structural implementation. Later phases remain a roadmap, not authorization to rewrite or deploy the full application.