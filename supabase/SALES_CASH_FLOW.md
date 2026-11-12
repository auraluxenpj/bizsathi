# Sales & Cash Flow bundle

Quotations are branch-protected, revision-checked snapshots. Saving/converting creates no financial, loyalty or stock movement; conversion atomically creates one linked immutable sale draft. Confirmation reuses existing commerce operations and enforces exact source quantities, rates, discounts, tax and customer snapshot. The original quotation is locked after conversion. Current stock, active items, mobile, permissions and open-period checks still apply. Tax changes can require a new quotation rather than silent repricing.

QR images use a private payment-qr bucket with tenant reads and administrator upload/delete policies. Server settings validate PNG/JPG signatures, size and business path. QR display is not payment verification. Signed images expire and refresh during active use; print only after the image loads. Old unreferenced uploads remain private and may be cleaned up separately.

Party statements use authorized confirmed document/return/payment evidence and disclose their authorized-branch scope. WhatsApp opens a reviewed text message for manual sending; no server send, attachment delivery or recipient receipt is claimed. Credit limits are administrator-editable, null is unconfigured and zero is zero outstanding allowance. Alerts do not block sales or expose hidden-branch balances.

## Migration catch-up
Earlier 0023/0024 changes were already present on the hosted database but unrecorded by the current migration runner. Their re-patches failed on the existing 5000-row catalogue limit and named-account/capital setup. The blocking files were commented out per migration recovery instructions; existing schema, accounts, balances and records were not removed. Fresh installs must restore those definitions from a verified schema backup rather than relying on the disabled files. No additional functionality from those duplicate patches is required by this bundle.

## Verification
Use `supabase/tests/sales_cash_flow.sql` ONLY against an isolated clone with schema/trusted roles. It rolls all synthetic data back and covers exact-request save/confirmation retries, one conversion, immutable quotations, snapshot preservation, stock/points timing, and unauthorized branches/tenants. Application tests cover credit boundaries, invoice QR and statement links. Live quotation mutation and real QR scanning need legitimate business input; no sample live transactions or payment QR are fabricated.

Rollback: stop using the new screens and restore the previous app; keep additive schema and conversion records. Never delete linked invoices or posted history. Review SECURITY DEFINER save/convert functions, quotation triggers and private storage policies before changing privileges.