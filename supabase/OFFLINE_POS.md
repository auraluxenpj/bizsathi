# Phase 6: interrupted-connectivity local POS drafts

## Scope

Local drafts can be created in an already-open, online-prepared POS during a connectivity interruption. They are **not confirmed invoices**, stock reservations, payments, or accounting postings. There is no service worker, offline fresh login, offline page reopening guarantee, cross-device synchronization, or automatic financial replay.

The normal authenticated route guard and database authorization remain unchanged. Reloading/closing the page can require internet and sign-in before recovery. Finalized offline billing and the remaining accounting corrections/costing are not included.

## Data protection and durability

- A minimum authenticated cache projection checks current staff-or-higher permission and active branch access. It includes product names/SKUs/barcodes/prices, calculated branch quantities, VAT/currency settings, and open periods, not customer details or the entire trading ledger. Stock/price reads are advisory; posting rechecks the authoritative transaction state.
- IndexedDB envelopes contain a versioned account/business/branch scope, revision, random salt and AES-GCM IV/ciphertext. PBKDF2-SHA256 (310,000 iterations) derives a nonextractable 256-bit key from the device passphrase; AES-GCM binds ciphertext to the scope. Passphrases and plaintext keys are never durably saved.
- Keys and decrypted views are locked on sign-out, identity updates, branch/business changes, explicit lock and unmount. Unsynchronized ciphertext is retained. Cached membership does not authorize any database action.
- A readwrite transaction compares revisions before writing. Competing tabs fail rather than overwrite another tab's drafts. A saved result follows transaction completion; read/write/storage failures remain visible. Persistence permission is requested and reported honestly.
- A forgotten passphrase, cleared browser storage or browser eviction may make drafts irrecoverable. No reset can recover encrypted data without the passphrase. No backup, compromised-device or XSS protection is claimed.

## Reconnect and confirmation contract

Reconnect refreshes access/product/period data, not financial submissions. Revoked access locks local data and retains encrypted unresolved work. Draft-specific baselines preserve which catalogue/tax information was used. Review surfaces inactive products, catalogue changes, tax-setting changes, insufficient stock and absent open periods. Updating catalogue prices/VAT requires explicit acceptance; editing quantities/date is user-directed. No automatic repricing occurs.

This increment uses walk-in sales with full payment selected during online review. Cash requires the existing valid cash-counter session; the posting operation still verifies it. Split payments/customer credit remain available in ordinary online POS, not the local-draft review form.

Before any network submission the exact validated request (including document/payment identifiers) is durably encrypted as uncertain. An authenticated read checks the ordinary immutable commerce document for matching business, branch, actor, kind, confirmed status and complete original request. Object key order is normalized for comparison. A collision/mismatch is not counted as confirmation. Unknown or lost-response outcomes keep the same payload; requests cannot be edited or discarded while unresolved. A status check precedes every retry, and successful submission is read back before marking confirmed. Posting continues through the existing serialized, idempotent database operation; there is no new ledger, table, permission grant or migration.

## Recovery

1. Restore internet and sign in as the original user, choose the same business/branch, and enter the same device passphrase.
2. Review the retained local drafts. Confirmed items link to ordinary sales history.
3. For uncertain work, check the saved sale first; retry only the exact retained request if needed. A revoked role/branch, inactive product, closed period, identifier conflict or invalid cash session needs authorized review; never invent a replacement request to bypass uncertainty.
4. If another tab changed the vault, lock/reopen it before trying another write. No stale tab may overwrite newer data.
5. Only unsubmitted local drafts and already-confirmed local copies can be explicitly discarded. Deleting a confirmed local copy never removes its server financial record.

## Rollback

No database change needs rolling back. Remove the local-draft UI/server wrappers if necessary, but preserve IndexedDB ciphertext and the adapter for recovery until users resolve outstanding work. Never automatically delete the encrypted store or issue replacement financial documents. Existing online request storage and posting operations are unchanged.

## Verification and remaining review

Unit/storage and UI integration tests cover encrypted recovery, multiple drafts, wrong passphrases, locking, cross-account writes, concurrent-tab conflict, denied storage, explicit reconnect price conflicts and uncertain-request check-before-retry. Isolated SQL checks exercise current revoked role/branch, changed VAT, inactive products, closed periods, stock rejection, exact retries, balanced posting and conflicting payload rejection. Existing tenant/inventory/commerce/report/voucher suites are rerun separately.

Live browser checks verify signed-out protection, signed-in local-draft prerequisites, offline indicator and tablet overflow. The real business has no active branch/products/open-period setup available for a complete live save/confirmation flow; no synthetic live data is inserted. Successful live confirmation, real populated recovery/read-back and live cash-session conflict handling remain unverified. The browser-storage engine and financial operations are exercised with isolated fixtures/tests, not claimed as live business verification. High-volume concurrency, compromised-device risks, broader storage quotas/eviction and full offline reopening need further review.