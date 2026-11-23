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

## Publication
- Catalogue sync is independent of publication. Published=false stays unpublished.
- Missing descriptions, images, SEO, colours, fabric, or collection data are allowed. Website listings may be completed later.
- Do not auto-publish a product merely because it exists in BizSathi.

## Cutover gates
1. Schema and code deployed to both systems while integration switches remain disabled.
2. Test create/update in each direction using test SKUs.
3. Test receipt, sale, return, adjustment, retry, duplicate event, out-of-order event, and offline recovery.
4. Verify exact SKU parity and stock parity without changing existing history.
5. Reconcile the 404-row workbook Master against BizSathi and Auraluxe.
6. Obtain separate approval before baseline stock adjustment, deactivating unmatched records, or enabling production sync.
