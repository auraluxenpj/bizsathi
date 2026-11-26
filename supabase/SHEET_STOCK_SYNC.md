# Aura Final → BizSathi → Auraluxe stock receipt sync

## Source and authority

- **Aura Final → Stock In tab** is the input for new stock receipts only.
- **BizSathi Products** is where a new product and its SKU/variant are created before the first receipt.
- **BizSathi Sutra stock ledger** is the inventory authority.
- **Auraluxe website** receives the resulting available quantity from BizSathi.

The Master tab is not used by this workflow. Do not use an absolute quantity import or stock reconciliation for these receipts.

## Stock In sheet format

Use one row per SKU receipt line. Required columns:

- `Receipt ID`: unique 3–60 character ID for this individual receipt line (for example `AF-2026-001-01`).
- `SKU`: exact SKU already created and active in BizSathi.
- `Qty Received`: positive whole number.

Optional columns: Date, Supplier / Note, Entered By, Applied in BizSathi, Applied on Website.

If one supplier invoice contains several SKUs, give each line a unique Receipt ID (for example `AF-2026-001-01`, `AF-2026-001-02`). Do not reuse one Receipt ID across multiple rows. Do not edit or delete a receipt after it has been posted; record a new receipt or an authorized stock adjustment to correct it.

## What “Sync sheet → Sutra → Website” does

1. Reads the `Stock In` tab from Aura Final on the server.
2. Validates Receipt ID, SKU and Qty Received; duplicate or malformed rows are reported and skipped.
3. Resolves the SKU to exactly one active BizSathi variant. Missing or duplicate SKUs are rejected; create/activate the product in BizSathi Products first.
4. Posts each new receipt once as a positive `receive` movement to the linked website fulfilment branch. The operation UUID is deterministic from the Auraluxe business ID and Receipt ID.
5. If the same receipt is synced again, BizSathi reports it as already recorded and adds zero stock. If the receipt details differ from the posted movement, the retry is blocked.
6. Runs the website inventory sync so website sales/returns are reconciled and BizSathi's resulting available quantities are pushed to Auraluxe.
7. Best-effort writes timestamps to `Applied in BizSathi` and `Applied on Website`. A sheet writeback failure does not undo a posted stock movement.

## Important controls

- Never enter the same receipt into the Auraluxe website admin as a second stock receipt.
- Never use an absolute Master Qty / current-stock import to represent a new delivery.
- Never reuse a SKU or Receipt ID.
- The selected branch must be the branch linked to the Auraluxe website.
- An existing receipt with a different SKU, quantity or branch is not replayed; use a new receipt ID for a genuine new delivery.
- Purchase cost is not posted by this Stock In workflow; maintain product costing separately in BizSathi.
- The sheet status columns are informational only. The BizSathi stock ledger and website acknowledgements are the authoritative evidence.

## Google Sheets access

For status writeback, configure `GOOGLE_SERVICE_ACCOUNT_JSON` on the BizSathi Cloudflare Worker and share Aura Final with that service account as an Editor. Enable the Google Sheets API and keep the two status headers on the Stock In tab. The sheet must be readable by the configured service account or via its published CSV access.

## Scope

This is a manual, administrator-triggered workflow. It does not create product catalogue records from a stock receipt row and does not run unattended in the background.
