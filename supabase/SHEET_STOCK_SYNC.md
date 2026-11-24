# Common sheet → BizSathi → website stock sync

One Google Sheet ("Aura Luxe Inventory Format") is the single place for product details and new stock.

- **Master** tab: one row per item, key = `SKU` (e.g. `AL-KURTI-001`). Import it from Products → Import from Google Sheets, with the tab name `Master`. Catalogue-only import is the default and does not change stock. The optional “Also reconcile Master Qty as branch stock” setting must only be enabled when the sheet contains verified physical on-hand counts for the selected branch.
- **Stock In** tab: one new row per receipt (`Receipt ID`, `SKU`, `Qty Received`). Never edit or delete an old row; correct mistakes with a new row or a stock adjustment.

## What "Sync sheet → BizSathi → Website" does (Inventory → Stock ledger → Sync with Website)
1. Reads the Stock In tab (server side only).
2. Posts each new receipt once as a `receive` movement on the linked fulfilment branch. Reference = `Sheet Stock In <Receipt ID>`; the operation UUID is derived from the Receipt ID, so retries (even by another administrator) cannot post twice.
3. Runs the existing website sync: website sales/returns come into BizSathi as acknowledgements, then BizSathi's counts are pushed to the website with the existing expected-count guards.
4. Best effort: writes a timestamp into `Applied in BizSathi` / `Applied on Website`. For writeback, configure `GOOGLE_SERVICE_ACCOUNT_JSON` on the BizSathi Worker, share the spreadsheet with that exact service account as an Editor, enable the Google Sheets API, and keep the two status headers on the Stock In tab. If writeback fails, the result now reports the likely permission/configuration issue; the stock ledger remains authoritative.

## Rules that keep the three places equal
- Receipts only enter through Stock In. Do not also type the same stock into the website admin or the Web tab: the next sync would see it as a website movement and record it a second time.
- A receipt whose SKU is missing/duplicated/ambiguous, whose Receipt ID repeats, or whose quantity is not a whole number ≥ 1 is skipped and listed.
- An already-recorded receipt that was edited later is refused (listed as "already recorded with different details").
- Unit cost is not applied; set purchase prices in Master.

## Not included
No background job: an administrator must press the button (every database function checks the signed-in administrator). Unattended scheduling needs a dedicated service identity and reviewed SQL, deliberately not added here.


## Missing SKU recovery

If Stock In reports that a SKU is not in active BizSathi inventory, import the Master tab from Products first and verify that the SKU is active and unique. Then retry the receipt. Do not create a duplicate variant or manually add the same receipt quantity elsewhere. Receipt IDs make the stock posting idempotent.
