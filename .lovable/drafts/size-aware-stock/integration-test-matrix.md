# Size-aware stock integration test matrix

**Test environment: isolated staging only.** These are required cases, not a claim that tests have been run.

| Area | Test | Expected result |
|---|---|---|
| Size master | Seed STANDARD, M, L, XL, 2XL, 3XL, 4XL–8XL and UNSORTED | Exact codes/order/plus flags; no XXL alias |
| Product setup | Apply category defaults then owner edits | Only enabled master sizes appear; plus-size-only product works |
| Legacy mapping | Migrate a product with unknown size composition | Entire verified baseline goes to UNSORTED; total preserved |
| Legacy mapping | Product individually confirmed genuinely non-sized | STANDARD only after explicit review |
| Legacy mapping | Product name/model/SKU suggests a size | No automatic size inference |
| Receiving | Receive 2XL quantity with unique receipt ID | 2XL ledger increases once; other sizes unchanged |
| Receiving | Retry same receipt and payload | Original result returned; no duplicate stock |
| Receiving | Reuse receipt ID with changed quantity/size | Rejected as idempotency conflict |
| Sale | Scan existing barcode, choose size, sell | Only selected size decreases |
| Sale | Attempt sale without size in enabled mode | Rejected except explicit admin reconciliation path |
| Sale | Attempt ordinary sale from UNSORTED | Rejected |
| Sale | Two concurrent sales compete for final unit | At most one succeeds |
| Returns | Return part of a confirmed sale | Exact original size increases; cumulative return bounded |
| Returns | Return a different size from original sale | Rejected |
| Exchange | Return old size and sell replacement size | Both post atomically or neither posts |
| Purchase return | Return against original receipt | Exact received size decreases; quantity cap enforced |
| Adjustment | Staff attempts adjustment without permission/reason | Rejected |
| Adjustment | Admin posts positive/negative adjustment | Audited movement; negative balance prevented |
| Transfer | Transfer size between two authorized branches | Equal source decrease and destination increase |
| Transfer | Same-branch or unauthorized destination transfer | Rejected; no partial movement |
| Reservation | Reserve available size quantity | Available-to-sell decreases; physical on-hand unchanged |
| Reservation | Concurrent reservation for same last unit | At most one active reservation succeeds |
| Reservation | Commit same reservation twice | One sale movement only |
| Reservation | Cancel/expire then retry | Release occurs once; no double release |
| Offline POS | Allocate stock to a counter | Allocation reduces central unallocated availability |
| Offline POS | Queue sale within counter allocation | Accepted on sync once; allocation consumed |
| Offline POS | Queue sale above allocation or replay transaction UUID | Conflict quarantined / idempotent prior result; never force-posted |
| Sheets | Import valid size and receipt ID | Preview validates master size; confirmed posting is idempotent |
| Sheets | Unknown size label | Row rejected with actionable error; no stock mutation |
| Sheets | Duplicate receipt line ID or changed retry | Duplicate rejected / changed payload conflict |
| Website | Read availability for enabled size | Returns branch-authorized size-level available quantity |
| Website | Reserve, commit, cancel, retry | Consistent state transitions and idempotent responses |
| Website | Legacy push attempts aggregate overwrite | Rejected/disabled after explicitly approved cutover |
| Security | Cross-business size/variant/branch ID supplied | Rejected without leaking other tenant data |
| Security | Authenticated user reads unauthorized branch | RLS denies access |
| History | Open old invoices without sizeId | Render exactly as before; no fabricated size |
| Finance | Confirm size-aware sale | Document, stock movement, payment and journal reconcile atomically |
| Membership | Complete sale with membership/reward points | Existing membership and loyalty behavior preserved |
| Loyalty | Return/reversal workflow | Linked ledger events; prior events remain immutable |
| Failure recovery | Force failure between document, movement and journal steps | Entire transaction rolls back |
| Reconciliation | Compare total stock by variant across legacy and size ledger | Exact parity; zero unexplained variance |
| Reconciliation | Compare confirmed documents/payments/journals before/after | No historical row changed or duplicated |
