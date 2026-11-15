# Size-aware transaction API contract — draft

**Design only. No runtime implementation or database changes.**

## Core rule

Every confirmed inventory-affecting document line must carry an explicit `sizeId` once the size-aware feature is enabled. The existing product variant remains the barcode/SKU identity. A sale line is identified by (business, branch, variant, size). Do not infer a size from SKU, barcode, product name or model code.

## Document line contract

New size-aware line payload:

```json
{
  "variantId": "existing-product-variant-uuid",
  "sizeId": "size-master-uuid",
  "quantity": 1,
  "price": 2500,
  "discount": 0,
  "taxRate": 0
}
```

The stored confirmed line must snapshot both stable identifiers and human-readable labels:
- variantId, sku, variant name
- sizeId, sizeCode, sizeLabel
- quantity, price, discount, taxRate, base, tax, total

The existing `commerce_documents.lines` JSONB must not be rewritten for historical documents. New fields are added only to new documents. Old document rendering remains backward-compatible when size fields are absent.

## Transaction types and stock direction

| Operation | Size ledger effect | Required source |
|---|---:|---|
| Purchase / goods receipt | + | Supplier receipt / purchase document |
| Sale | - | Confirmed sale |
| Sale return | + | Original confirmed sale line; same size |
| Purchase return | - | Original received purchase line; same size |
| Adjustment | +/- | Reason and authorised admin |
| Transfer | - source, + destination | Same size at both branches |
| Reservation | reserve only; not physical decrement | Unique reservation ID |
| Reservation commit | - available/on-hand exactly once | Existing reservation |
| Reservation cancel/expiry | release reserved quantity | Existing reservation |

Reservation quantity must be accounted for in available-to-sell, not double-posted as a second physical movement.

## Required database posting functions

All write functions must be transactionally atomic and tenant/branch/role checked:

1. `post_size_stock_movement(request)` — internal primitive, not directly executable by browser clients.
2. `post_size_commerce_document(request)` — sale, purchase, receipt and return line posting; creates document, ledger movement and accounting journal in one transaction.
3. `post_size_stock_adjustment(request)` — admin-only adjustment with mandatory reason.
4. `post_size_stock_transfer(request)` — atomic paired source/destination movements; cannot transfer to same branch.
5. `reserve_size_stock(request)` — reserve available quantity with expiry and idempotency.
6. `commit_size_reservation(request)` — convert reservation into one sale movement exactly once.
7. `release_size_reservation(request)` — release once; safe to retry.
8. `get_size_stock_snapshot(business, branch, variant)` — branch-authorized size balances and available quantities.

These names are proposed only; verify naming conventions and helper signatures before implementation.

## Validation rules

- Business membership and role checked server-side using existing role helpers.
- Branch permission checked using `can_access_branch` for every source and destination branch.
- Variant belongs to business and is active; product is active.
- Size belongs to same business and is active for new transactions.
- Size must be enabled in `product_size_options` for that product, except UNSORTED migration/reconciliation paths.
- UNSORTED is never selectable for ordinary customer sale or website availability.
- Quantity is positive, finite, and to three decimal places; retail apparel may additionally require whole-unit quantities if business policy confirms this.
- A sale cannot exceed size-level on-hand minus active reservations and offline allocations.
- Returns reference original document and exact original sizeId; cumulative returns cannot exceed source line quantity.
- Purchase returns cannot exceed received quantity for that exact size.
- Transfer uses one transaction and paired equal/opposite movements.
- Adjustments require reason, actor and optional evidence/reference.
- No direct client insert/update/delete into movement or reservation tables.

## Idempotency and concurrency

- Every external request supplies a stable request UUID/idempotency key.
- Unique key is scoped to business and operation type.
- Identical retry returns the original document/movement/reservation.
- Same key with different payload is rejected.
- Acquire business-level advisory lock consistent with existing commerce functions; also lock relevant variant/size/branch balance rows or a deterministic key before checking availability.
- Reservation, commit and sale posting must serialize for the same stock key.
- All writes, journal entries and movement rows commit or roll back together.

## Existing invoice function transition

Current `post_commerce_document` accepts only variantId and posts aggregate stock movements. Do not replace it abruptly.

Recommended compatibility sequence:
1. Keep the existing RPC available for legacy documents while size mode is disabled.
2. Add a new size-aware RPC that validates sizeId and posts the size ledger plus existing commerce document/accounting structures safely.
3. Add a feature flag per business/branch, default OFF.
4. When OFF, legacy workflow remains unchanged.
5. Before enabling, require all opening balances to be reconciled and all new POS/website clients to send sizeId.
6. When ON, reject size-less confirmed stock-affecting sale/receipt/return requests unless explicitly routed to an admin-only UNSORTED reconciliation path.
7. Only after staging proves parity should a separately approved cutover change the authoritative balance/snapshot functions.

Avoid posting the same transaction to both stock ledgers as live quantities; that would double-count under current `commerce_stock_balance`.

## Reservation and offline allocation

Reservations need a dedicated table with states `active`, `committed`, `released`, `expired`, expiry, source, size key, quantity and idempotency key. State transitions are one-way and audited.

Offline counter allocations are not stock receipts. They reserve a fixed quantity per branch/counter/variant/size from central availability. The offline POS can sell only against that allocation. A queued sale carries a globally unique transaction UUID and allocation reference. Sync atomically consumes allocation and posts sale; replay returns prior result. Conflicts are quarantined for staff review, never force-posted.

## Returns and exchanges

A return restores the exact original size. An exchange is two linked operations in one business workflow: return original size + sale replacement size. Both must succeed atomically or neither posts. Preserve original invoice, payments, membership and loyalty event history; any reward-point reversal/award is a separate linked ledger event under existing loyalty rules.

## API responses

Every write response should return:
- accepted/rejected state
- canonical transaction/document ID
- idempotency key
- posted movement IDs
- size-level before/after balances
- reservation/allocation status when applicable
- server timestamp
- structured conflict code for offline sync

Never return success until the database transaction commits.
