# AURALUXE ↔ BizSathi publication sync contract

Status: publication-only two-way sync. All operational catalogue and inventory authority remains unchanged.

## Scope
- Publication state is mirrored both directions for already-mapped products.
- Publish/unpublish in BizSathi mirrors to AURALUXE.
- Publish/unpublish in AURALUXE mirrors to BizSathi.
- Product details, category, price, purchase price, MRP, wholesale price, reorder level, SKU, barcode, variants, stock and stock history retain their existing sync direction and behaviour.
- Routine catalogue, price, stock, variant or product-detail sync must never change either system's publication flag.
- No automatic bulk republishing is performed for existing products.

## Identity and safety
- Every publication event must match the exact remote product ID, remote variant ID and normalized SKU mapping.
- An unknown or conflicting mapping is rejected and remains retryable/dead-lettered through the existing outbox failure policy.
- Publication updates use dedicated publication-only outbox events and receiver RPCs. They do not write operational catalogue fields.
- The receiving database sets an origin marker so the mirrored update does not echo back as a second event.
- Service-to-service endpoints require the existing shared inventory sync secret; no service-role key is exposed to browser code.
- The scheduler processes publication events independently after the existing catalogue and stock jobs. A publication delivery failure must not stop those existing workflows.

## Authority
- BizSathi remains authoritative for operational catalogue data and inventory.
- AURALUXE remains the storefront and owns website-only merchandising.
- Publication visibility is an explicitly mirrored flag, not a side effect of product/variant activation, price, stock or routine sync.
- Stock movements remain BizSathi → AURALUXE only. No reverse stock sync is introduced.
