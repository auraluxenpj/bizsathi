# Phase 6 — Offline POS, first safe increment

## Audit result

The current POS needs an internet connection to verify access and load trading records. Its retained request is one tab-scoped online retry, not a durable offline queue. Existing sale confirmation already rechecks permissions, stock, active products, tax settings and open periods, and accepts only exact-payload retries for the same request identifier.

Offline confirmation is therefore not ready to enable unchanged. Remaining accounting corrections and costing are still separate, unfinished work; this phase will not imply they are complete.

## Deliverable for this approval

**Durable local POS drafts and explicit reconnect review**, not finalized offline invoices.

1. Let an authorized user explicitly prepare the current POS for interrupted connectivity while online, using only the selected business and accessible branch's minimum product/pricing and trading settings. Do not persist the full commerce workspace, ledger, customer history or authentication tokens in the offline store.
2. In the already-open POS, allow product search, cart editing and local draft saving when connectivity drops. Display connection state, cached-data age and provisional totals. Saving locally must finish successfully before showing a saved result; storage denial/fullness must stop completion rather than lose a draft silently.
3. Store multiple local drafts with unique identifiers, durable browser storage, timestamps and explicit states: local draft, awaiting review, confirmation uncertain, confirmed, and needs attention. Local drafts do not change stock, cash, tax reports or accounting and cannot produce a confirmed tax receipt.
4. When internet returns, refresh authorized trading data and show conflicts: changed product/pricing or tax data, unavailable stock, closed periods and changed access. Reconnect refresh is automatic; financial submission requires explicit review and confirmation. Never silently rewrite amounts, dates or payment selections.
5. Submit reviewed work through existing atomic sale confirmation. Retain the exact submission identifier and payload before the network call. If the response is lost, check that identifier before retrying; do not create a second sale. Confirmed work must read back from the ordinary sales history before being marked synchronized.
6. Add a local draft list with recovery, review, retry/check and explicit discard controls. Immutable attempted requests cannot be edited into another submission until their server status is resolved.
7. Protect persisted drafts with encryption unlocked by a user-created device passphrase; do not store the passphrase or durable plaintext keys alongside drafts. Lock on sign-out and identity/business changes without deleting unsynchronized work. Forgotten-passphrase/browser-clearing loss must be disclosed before enabling storage. Do not claim protection from a compromised device or malicious scripts.

## Honest boundaries

- This increment supports **an already-open POS during a connection interruption**. Offline reopening, fresh login, finalized offline billing, cash-counter changes, returns, refunds and automatic financial replay are excluded.
- The existing signed-in access checks remain unchanged. A hard refresh or closed tab may require internet and sign-in before encrypted drafts can be recovered. Do not weaken authentication to hide that limitation.
- Cached access cannot discover a new permission revocation while disconnected. Local work is provisional; every server submission rechecks current authority. Revoked access locks the business cache and pauses submission while retaining encrypted unresolved drafts.
- Each browser/device works independently. No stock reservation or cross-device offline synchronization is promised; a local-network coordinator would require a separate infrastructure review and approval.
- Browser storage is not a backup and may be removed by the user or browser. Request persistent storage where available, report its status honestly, and preserve failed writes visibly.
- No live sample transactions, additional paid service, deployment or domain changes.

## Verification gate

- Unit tests for scoped storage, successful durable save, storage failures, state transitions, exact identifier/payload reuse, encryption and locking.
- Browser checks for disconnect/edit/save/reconnect/review, page reopening and encrypted recovery after online sign-in, uncertain-response status checks, sign-out/account switching, and no cross-business visibility.
- Isolated database checks for repeated and conflicting submissions, current role/branch revocation, changed tax/active-product/stock/open-period conditions, and balanced stock/accounting effects after a single successful posting.
- Verify with legitimate live products, branches and an open period only if available. Otherwise report successful live confirmation and populated read-back as blocked, never fabricate business activity.
- Preserve existing sales, inventory, vouchers and reports and run their relevant regression tests. Record recovery instructions and remaining limitations.

## Technical approach

Use a focused browser-only IndexedDB adapter with versioned records and Web Crypto encryption, separate from existing online retry storage. Persist render-visible state only after hydration. Reuse Decimal calculations, validated commerce requests and authenticated server functions; no replacement financial ledger or unrestricted table writes. Add a minimal authenticated cache projection rather than persisting broad workspace responses. Use current database permissions as the server authority, never cached roles or local storage as permission evidence.

No service worker is needed for this already-open-session increment. A later separately approved offline-reopening step must use the supported generated PWA worker, exclude authenticated responses and OAuth from shared caching, and disable worker registration in development and Lovable previews. Full offline reopening can only be verified on an eligible published app; publication still requires explicit permission.

## Cost and stopping point

Expected credit impact is medium–high because durable recovery and financial retry checks need adversarial testing. Reuse existing Cloud services; add no paid integration. After this increment, stop for review before expanding to full offline billing or the final verification phase.