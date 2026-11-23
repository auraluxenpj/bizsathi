# Auraluxe ↔ BizSathi Shared Catalogue and Inventory Contract

Status: implementation contract; integrations remain disabled until parity tests and cutover approval.

## Identity and matching
- SKU is the sole cross-system product/variant matching key. Normalize by trimming whitespace and compare case-insensitively; preserve the entered SKU casing for display.
- Model Code is optional reference metadata. It may repeat across any number of products and must never be used as a unique key, merge key, or conflict rejection condition.
- Product names, category labels, barcodes, and model codes are not identity keys.
- Preserve each system's local primary keys. Store the remote system's IDs only as cross-reference metadata.

## Shared catalogue fields
The common catalogue row follows the workbook's Master tab:
SKU, Model Code, Product Name, Category, Unit, Sizes, Qty, Purchase Price, MRP, Selling Price, Reorder Level, Published, Notes, Barcode.

Required operational values: SKU, Category, Unit, Qty, Purchase Price, MRP, Selling Price, Reorder Level. Product Name may be empty at the integration boundary; when a database requires a non-null display name, use SKU as a temporary internal fallback and retain the source name as empty metadata so it can be completed later. Model Code, sizes, notes, and barcode may be empty. Model Code duplicates are allowed.

## Website-only fields
Description, fabric, colours, images, SEO title/description, slug/URL merchandising fields, collection mapping, new-arrival, bestseller, and featured are website enrichment fields. They are optional and must never reject a catalogue sync. Preserve existing website enrichment when a BizSathi update omits it; leave it blank for new records. A missing website field does not imply that the product should be published.

## Two-way event protocol
- Both systems emit versioned, uniquely identified catalogue and inventory events through a durable transactional outbox.
- Every event carries event_id, source_system, business_id, SKU, entity_type, operation, source_version, occurred_at, and a payload.
- Consumers persist event_id in an inbox/deduplication table and apply each event once.
- Ignore events already applied. Reject stale source_version values for the same source/SKU; never allow delayed retries to overwrite a newer state.
- Mark outbound events delivered only after the receiver confirms durable acceptance. Retry with bounded backoff and visible dead-letter status.
- Do not echo an inbound event back to its origin. Local edits create new events with new IDs.
- For simultaneous edits from both systems, record a visible conflict and require reconciliation; do not silently choose a winner.

## Inventory semantics
- Stock is synchronised as immutable, idempotent stock transactions (receipt, sale, return, adjustment, transfer), not as repeated absolute quantity overwrites.
- Each transaction carries a globally unique operation/event ID, SKU, quantity, direction/type, branch/location, source document reference, and occurred_at.
- A transaction may affect on-hand stock once only. Retries must return the prior result.
- Existing stock movement and sales/purchase history is retained. No hard deletes or history rewrites.
- The workbook's Qty is a reconciliation/baseline quantity, not a per-size quantity. Do not copy a product total into every listed size. Per-size stock requires separate SKU/quantity rows.
- Existing receipt rows marked applied in either destination must not be replayed.


### SKU-pooled stock for size-based storefront products
- BizSathi is the stock ledger of record. Auraluxe checkout reserves and commits stock through BizSathi; a committed order creates an immutable website movement in BizSathi.
- BizSathi stock movements (native receipts, sales, adjustments, transfers, website commits and accepted returns) publish back to Auraluxe as idempotent delta events.
- When one BizSathi SKU represents a product with several website size choices, Auraluxe uses one generic mapped variant and one pooled SKU balance. The size is captured on the order, but stock is reserved against the total SKU balance. The system must not display or invent a size-specific quantity.
- If size-specific inventory is required, each size must have its own confirmed SKU and BizSathi quantity before it can be independently reserved.
- Auraluxe applies events only after an administrator has registered a physical-count baseline for that exact SKU and cross-system variant mapping. The verified physical count must first be reconciled in BizSathi so the two quantities match; the baseline records both quantities, verifier and count reference. Subsequent events must arrive in strict per-SKU version order.
- Fractional movements and negative projected balances are not silently rounded or forced through; they are blocked for reconciliation. Dead-letter events block later events for the same SKU until reviewed.
- Legacy absolute stock snapshot projection is retired. The only ongoing projection path is the immutable movement-event stream.

## Publication
- Catalogue sync is independent of publication. Published=false stays unpublished.
- Missing descriptions, images, SEO, colours, fabric, or collection data are allowed. Website listings may be completed later.
- Do not auto-publish a product merely because it exists in BizSathi.

## Cutover gates
1. Deploy schema and code to both systems while every catalogue, stock, checkout-reservation and website-authority switch remains disabled.
2. Complete and owner-approve the SKU mapping sheet. Do not infer matches from Model Code or numeric suffixes; confirm the physical label, category, style, size and colour. Keep unmatched records untouched.
3. Enable catalogue sync only after approved mappings exist. Test create/update in each direction with isolated test SKUs and confirm the returned cross-reference IDs.
4. Physically count each approved SKU. Post any variance as an audited BizSathi stock adjustment so BizSathi's ledger equals the verified count.
5. Register the Auraluxe baseline for each approved SKU while Auraluxe stock authority and stock-event delivery are still disabled. The RPC requires the physical count and BizSathi ledger quantity to match.
6. Enable the Auraluxe receiver/authority first, then the BizSathi stock-event publisher and website reservation integration. Enable checkout reservations only after both stock event sides are ready.
7. Test receipt, native sale, website sale, return, adjustment, transfer, retry, duplicate event, out-of-order event, negative-stock rejection and offline recovery.
8. Verify SKU and stock parity without changing existing movement history. Keep all unmatched records and dead-letter events visible for review.
9. Obtain separate owner approval before any baseline write, unmatched-record deactivation, production deployment or sync activation.
