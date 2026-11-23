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

## Authority and direction
- BizSathi is the single source of truth for Auraluxe catalogue and inventory. Auraluxe is a storefront/projection, not a second catalogue or stock authority.
- Catalogue changes flow only BizSathi → Auraluxe. Auraluxe-origin catalogue ingestion and publishing are disabled.
- Stock movements flow only BizSathi → Auraluxe as immutable, idempotent deltas. Auraluxe checkout reservations and commits must be recorded in BizSathi; Auraluxe must not originate stock adjustments.
- Website-only enrichment (images, descriptions, SEO, colours, fabric and merchandising) may be maintained on matched Auraluxe SKUs. It cannot create an independently sellable product or override BizSathi-owned fields.
- SKU is the only cross-system matching key. Model Code is optional reference metadata, may repeat, and must never be used as a merge key or uniqueness constraint.

## Catalogue reconciliation
- A full BizSathi snapshot is the only operation allowed to reconcile the complete Auraluxe catalogue. Incremental SKU events update matched records but never infer that an omitted SKU is deleted.
- For each matching SKU, BizSathi overwrites the shared operational fields: product name, category, SKU, unit, sizes, purchase price, MRP, selling price, wholesale price, reorder level, publication state, notes and barcode. Preserve Auraluxe website-only enrichment fields.
- Any Auraluxe product absent from the full BizSathi snapshot, or containing a variant SKU absent from that snapshot, is unpublished/deactivated from the storefront. Never hard-delete products, variants, orders or historical records.
- Auraluxe-only products cannot be republished once the BizSathi catalogue authority switch is enabled.
- A missing website-only field is allowed and does not block sync. Missing website enrichment does not imply publication.
- A snapshot must contain unique, non-empty SKUs. Model Code duplicates are allowed. SKU changes require an explicit re-key/reconciliation workflow; never infer a rename.

## Inventory semantics
- BizSathi is the only stock ledger of record. Auraluxe stock is a read-only projection of approved BizSathi balances and movements.
- BizSathi receipts, sales, website commits, returns, adjustments and transfers publish to Auraluxe as immutable, idempotent delta events. Never use repeated absolute stock overwrites.
- Auraluxe-origin stock edits and reverse stock-event publication are disabled. Checkout reserves/commits against the BizSathi SKU balance; the selected size is an order attribute, not a separate quantity unless BizSathi has a separate SKU and quantity for that size.
- Each event carries a globally unique operation/event ID, SKU, per-SKU version, quantity delta, source movement reference and occurred_at. Consumers deduplicate event IDs, enforce strict per-SKU ordering and reject negative projected balances.
- Auraluxe applies events only after an administrator registers a physical-count baseline for the exact SKU and cross-system mapping. The physical count must first be reconciled in BizSathi so both quantities match. Record verifier and count reference.
- Fractional movements, missing mappings, negative projected balances and out-of-order events are blocked for reconciliation. Dead-letter events block later events for the same SKU until reviewed.
- Existing stock movement, sales and purchase history is retained. No hard deletes, history rewrites or silent stock adjustments.

## Publication
- Catalogue sync is independent of publication. Published=false stays unpublished.
- Missing descriptions, images, SEO, colours, fabric, or collection data are allowed. Website listings may be completed later.
- Do not auto-publish a product merely because it exists in BizSathi.

## Cutover gates
1. Deploy schema and code to both systems while all catalogue, stock, checkout-reservation and website-authority switches remain disabled.
2. Complete and owner-approve the SKU mapping sheet. Match by exact SKU and verify physical label, category, style, size and colour. Never infer matches from Model Code or numeric suffixes.
3. Enable only the Auraluxe BizSathi-catalogue receiver switch. Keep BizSathi's incremental catalogue outbox disabled.
4. Run the explicit full-snapshot publisher from BizSathi to Auraluxe. Review the matched/created/updated counts and the list/count of Auraluxe-only products unpublished by reconciliation. No hard deletes are allowed.
5. After snapshot parity is confirmed, enable BizSathi's incremental catalogue outbox. From then on, catalogue changes flow only BizSathi → Auraluxe.
6. Physically count each approved stock SKU. Post any variance as an audited BizSathi stock adjustment so the BizSathi ledger equals the verified count. Register the Auraluxe baseline for each exact SKU while stock event delivery and website checkout authority remain disabled.
7. Enable the Auraluxe stock-event receiver/authority, then the BizSathi stock-event publisher and website reservation integration. Enable checkout reservations only after both ends are confirmed ready.
8. Test native receipt, sale, website sale, return, adjustment, transfer, retry, duplicate event, out-of-order event, negative-stock rejection and offline recovery. Verify stock parity and preserve all movement history.
9. Obtain separate owner approval before any baseline write, full-snapshot unpublishing, production deployment or switch activation. Keep unmatched mappings and dead-letter events visible for review.
