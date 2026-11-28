# BizSathi → Auraluxe Catalogue and Inventory Authority Contract

Status: active production integration. Publication-preservation behaviour is enforced in the Auraluxe production database.

## Identity and matching
- SKU is the sole cross-system product/variant matching key. Normalize by trimming whitespace and compare case-insensitively; preserve the entered SKU casing for display.
- Model Code is optional reference metadata. It may repeat across any number of products and must never be used as a unique key, merge key, or conflict rejection condition.
- Product names, category labels, barcodes, and model codes are not identity keys.
- Preserve each system's local primary keys. Store the remote system's IDs only as cross-reference metadata.

## Shared catalogue fields
The common catalogue row follows the workbook's Master tab:
SKU, Model Code, Product Name, Category, Unit, Sizes, Qty, Purchase Price, MRP, Selling Price, Reorder Level, Notes, Barcode.

Required operational values: SKU, Category, Unit, Qty, Purchase Price, MRP, Selling Price, Reorder Level. Product Name may be empty at the integration boundary; when a database requires a non-null display name, use SKU as a temporary internal fallback and retain the source name as empty metadata so it can be completed later. Model Code, sizes, notes, and barcode may be empty. Model Code duplicates are allowed.

## Website-only fields
Description, fabric, colours, images, SEO title/description, slug/URL merchandising fields, collection mapping, new-arrival, bestseller, and featured are website enrichment fields. They are optional and must never reject a catalogue sync. Preserve existing website enrichment when a BizSathi update omits it; leave it blank for new records.

## Authority and direction
- BizSathi is the source of truth for operational catalogue data and inventory. Auraluxe is the storefront and owns storefront publication state and website-only merchandising.
- Operational catalogue changes flow BizSathi → Auraluxe. Publication changes are made explicitly in Auraluxe and are never inferred from a routine BizSathi sync.
- Stock movements flow only BizSathi → Auraluxe as immutable, idempotent deltas. Auraluxe checkout reservations and commits must be recorded in BizSathi; Auraluxe must not originate stock adjustments.
- Website-only enrichment (images, descriptions, SEO, colours, fabric and merchandising) may be maintained on matched Auraluxe SKUs. It cannot create an independently sellable product or override BizSathi-owned operational fields.
- SKU is the only cross-system matching key. Model Code is optional reference metadata, may repeat, and must never be used as a merge key or uniqueness constraint.

## Catalogue reconciliation
- A full BizSathi snapshot validates and reconciles SKU mappings. Incremental SKU events update matched records but never infer that an omitted SKU is deleted.
- For each matching SKU, BizSathi updates operational fields only: product name, category, SKU, unit, sizes, purchase price, MRP, selling price, wholesale price, reorder level, notes and barcode. It must not update Auraluxe's `is_published` field.
- Existing Auraluxe publication status is preserved for every matched product during both incremental and full-snapshot syncs, even when the BizSathi payload contains `published=false` or omits the field.
- A product or variant absent from a snapshot is not unpublished, deactivated, or deleted by reconciliation. Missing SKU data is a mapping exception to review, not a publication instruction.
- Newly created Auraluxe products are unpublished drafts. An administrator must publish them explicitly in Auraluxe after checking images, descriptions, price and merchandising.
- BizSathi product or variant activation/deactivation does not silently change Auraluxe publication state. Any future cross-system publication workflow must be a separate explicit action with its own confirmation and audit trail.
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
- Auraluxe is the authority for whether an existing product is visible on the storefront.
- Catalogue sync must preserve the existing publication flag; routine sync is not a publish or unpublish action.
- New products created by sync remain unpublished drafts until an Auraluxe administrator publishes them.
- Missing descriptions, images, SEO, colours, fabric, or collection data do not trigger automatic publication or unpublication.

## Cutover and operational safeguards
1. Keep SKU mapping and stock-baseline validation separate from storefront publication.
2. Review matched, created, updated and unmatched SKU counts after a full snapshot. No product is unpublished or deleted by the snapshot.
3. Keep incremental catalogue delivery idempotent and acknowledge only after Auraluxe confirms the operational update.
4. Physically count each approved stock SKU. Post any variance as an audited BizSathi stock adjustment so the BizSathi ledger equals the verified count. Register the Auraluxe baseline for each exact SKU while stock event delivery and website checkout authority remain disabled.
5. Enable the Auraluxe stock-event receiver/authority, then the BizSathi stock-event publisher and website reservation integration. Enable checkout reservations only after both ends are confirmed ready.
6. Test native receipt, sale, website sale, return, adjustment, transfer, retry, duplicate event, out-of-order event, negative-stock rejection and offline recovery. Verify stock parity and preserve all movement history.
7. Require explicit owner approval for any future change that would affect publication state, stock baselines, production sync switches or live catalogue records.
