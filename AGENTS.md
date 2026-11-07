<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Tenant data: every tenant table has `business_id`, RLS via `is_business_member`/`has_business_role` (rank from `roles` table); membership writes only through SECURITY DEFINER RPCs. Why: permissions must come from DB records, never client input.
- After any new table, REVOKE platform default grants and grant least privilege explicitly. Why: defaults give authenticated full write access.
- Financial/posted records use ON DELETE RESTRICT, never CASCADE. Why: accounting history must not vanish.
- Security review history uses append-only tenant events with administrator RLS and server-side membership verification; findings, analyses, and decisions remain separate evidence. Why: preserve attribution and prevent AI advice from becoming an approval.
- AI reviews use server-only Lovable Gateway Responses streaming with persisted access pauses and no automatic retries. Why: keep secrets private and avoid repeated billing or denied calls.
- Business onboarding reuses the atomic create_business RPC; invitations store only hashed email-bound tokens and accept through a locked database operation that rechecks inviter authority. Why: prevent duplicate infrastructure and stale invitation privilege grants.
- Branch-scoped data uses can_access_branch plus operation-specific role checks; administrators have manager access and lower roles require explicit branch_memberships. Why: business membership alone must not expose every branch.
- Shared workspace navigation lives around the root Outlet; dashboard uses existing authorized business/branch queries and null financial values until operational sources exist. Why: preserve public routes and avoid fabricated balances or duplicate data structures.
- Inventory uses business-wide product/variant and party records with administrator writes; stock posts through a serialized, idempotent database operation to an append-only branch ledger. Why: enforce atomic transfers, prevent negative stock and duplicate retries, and preserve traceable corrections.
- Catalogue CSV uses Papa Parse, validates all rows before a single atomic import, and escapes spreadsheet formulas on exports. Why: handle quoted values reliably without partial imports or unsafe spreadsheet cells.
- Commerce confirms immutable documents, quantity movements, payments and balanced periodic-accounting entries through authenticated database RPCs under a shared business lock and an open-period row lock. Why: keep retries, stock, tax snapshots, cash and closed-period protection consistent.
- Quantity reads combine legacy and document-linked movements; invoice entry and goods receiving remain separate events. Why: preserve Phase 3 history and avoid receiving the same purchase twice.
- Online document requests are retained per user/business in session storage until confirmed or explicitly checked; this is not offline billing. Why: keep unchanged retry identifiers without promising disconnected sales.
- Monetary previews use Decimal.js with per-line half-up rounding, matching PostgreSQL numeric posting. Why: avoid fractional-cent drift and defer inventory valuation and COGS to reliable costing.
- Accounting reports reuse a single invoker-RLS database snapshot of commerce evidence with numeric text, server-side Decimal aggregation and pagination after totals; no parallel ledger. Why: preserve authorization, read consistency and exact opening/closing balances without duplicate posting.
- Manual vouchers use restricted account RPC posting into the existing journal, generated source IDs, immutable headers, exact-payload idempotency and administrator full voucher-only reversals under the shared business/period locks. Why: preserve source attribution without altering invoice, stock, tax or counter evidence.
- Interrupted-connectivity POS uses scoped, passphrase-encrypted IndexedDB drafts with compare-and-swap revisions, ephemeral keys and explicit server-reviewed exact-request confirmation; no service worker or offline authorization bypass. Why: recover local work without treating cached access or provisional drafts as posted sales.
- Business reports extend the invoker-RLS evidence snapshot with both quantity ledgers and evidence-only actors; activity user filters never reduce whole-stock/trial balances or linked invoice settlements. Why: preserve complete as-of balances and attribution without inventing costing or duplicate financial records.
- Mobile loyalty identities remain separate from auth roles and parties; immutable source-unique point events post through a commerce insert trigger under the existing business lock, with branch-RLS balance reads and legacy exact-request recovery. Why: enforce atomic earning/return adjustments without duplicate awards, customer merges or exposing other branches.
- Website stock sync uses one protected Auraluxe fulfilment-branch binding, leased manual server calls, globally deduplicated append-only quantity acknowledgements and conditional website pushes; no financial documents are inferred. Why: preserve branch attribution, cross-administrator retries and concurrent website orders without exposing shared secrets.
