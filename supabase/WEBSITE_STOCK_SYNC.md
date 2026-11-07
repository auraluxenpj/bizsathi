# Auraluxe website stock sync

Manual inventory-only connection to the supplied Auraluxe POST endpoint. The shared `INVENTORY_SYNC_SECRET` stays server-side. Only the existing Auraluxe tenant and its administrators may compare or synchronize; the first confirmed run permanently binds one active fulfilment branch. No anonymous endpoint is added to BizSathi.

## Workflow

Compare active SKUs and review the first agreement before confirming. Both quantity ledgers contribute to the branch count. Website acknowledgements become traceable stock adjustments, not financial sales, tax entries or loyalty awards. The website API does not expose individual order identities and treats any website count decrease/increase as sale/return-style quantity evidence. It cannot reconstruct sales before the initial baseline.

Each acknowledgement is recorded locally once, then completed remotely. Failed completion leaves the remote acknowledgement pending for cross-administrator recovery. Failed local stock posting never completes the acknowledgement. Remote pushes include expected current stock and skip website changes/pending acknowledgements. Missing or ambiguous SKUs and non-integer counts are skipped. One sync lease prevents overlapping BizSathi runs; no automatic replay or background jobs.

## Recovery and review

- Compare again after an uncertain outcome; never manually repeat the corresponding adjustment. Local evidence deduplicates remote IDs across actors.
- A terminated run holds its lease for at most five minutes. The next run must use the same fulfilment branch.
- Branch reassignment requires an explicitly reviewed future migration/reconciliation; direct writes are denied.
- A first agreement can replace website quantity with the selected branch count. Review real SKU mapping and counts before confirming.
- Website sales and BizSathi writes cannot share a distributed transaction. Remote expected-count guards prevent concurrent website orders being overwritten; new BizSathi activity after the final snapshot needs another manual sync. This is not real-time cross-system stock reservation.
- The database exposes restricted administrator RPCs for durable acknowledgements; trusted authorized administrators can post quantity adjustments independently. External credentials are never accepted from the browser.
- Roll forward only; preserve binding, acknowledgements and stock history. Disabling the UI does not reverse stock movements. Corrections require traceable authorized stock adjustments.
- Migration 0021 was commented out because its notebook tables already existed in the live database. No existing notebook or bill records were removed.

## Activation checks

Verify the shared secret against a read-only comparison and review the actual fulfilment branch/SKU mapping before a live stock-changing run. Synthetic tests must run only in an isolated database. No Auraluxe website code or deployment is modified from this project.