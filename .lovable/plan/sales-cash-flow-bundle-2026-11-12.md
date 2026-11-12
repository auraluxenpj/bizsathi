# Sales & Cash Flow bundle

## Audit findings
- Sales and POS already share invoice entry, confirmation, payments, loyalty and printing.
- There is no quotation workflow, payment QR setting or stored customer credit limit.
- Parties already calculates balances and shows invoice/payment ledgers. Existing WhatsApp actions open a ready message in the user's WhatsApp; they do not send automatically.

## What to add

### 1. Quotations / estimates
- Add a Quotations page with creation, editing, date/branch/customer filters, printable estimates, expiry date and draft/sent/accepted/declined/converted states.
- Save original customer details and item descriptions, quantities, prices, discounts and tax treatment as quotation snapshots.
- **Convert to Sale** creates and opens a linked, unconfirmed sale invoice with the exact quotation details. It does not silently confirm a sale or collect payment.
- Require the existing mandatory customer mobile and current branch, stock, period and permission checks when confirming the sale. Award points only at sale confirmation.
- Preserve the quotation and conversion link, prevent duplicate conversions on retries, and lock converted quotations against editing. Flag unavailable products rather than silently replacing them or repricing.

### 2. Business payment QR
- Add administrator settings to upload an existing Fonepay/eSewa/bank QR image and enter provider, payee and payment instructions. Do not fabricate a payment code.
- Show the saved QR and payee on sale invoices, POS receipt previews and A4/thermal printed receipts, with replace/remove controls and a preview.
- Keep existing payment recording separate: scanning a static QR does not prove payment or automatically settle an invoice.

### 3. Party statements and credit limits
- Add **WhatsApp statement** in customer and supplier detail, with a reviewable, pre-formatted message containing business/party, statement date, outstanding balance direction, unpaid invoice summary and configured payment details.
- Open the party's WhatsApp conversation for the user to send; offer copy/share when no valid phone exists. Do not expose private statement links or claim delivery.
- Allow administrators to set customer credit limits in NPR; blank means no configured limit and zero means no permitted outstanding credit.
- Show alerts in Parties and checkout when recorded customer outstanding exceeds the limit, and a separate warning when the proposed unpaid sale would exceed it. These are alerts, not a new sale-blocking rule.
- Use authorized confirmed invoices, returns and payments, not estimates or draft totals. Branch-restricted users see only authorized balances, explicitly labelled as such; do not expose hidden branch amounts.

## Safety and technical approach
- Reuse the current commerce posting, exact-request recovery, monetary rounding, stock, loyalty, party-ledger and invoice print logic; no second financial ledger or payment integration.
- Add tenant/branch-protected quotation records and narrowly protected payment/credit settings through migrations with explicit least-privilege grants, RLS and trusted DB authorization. Preserve posted history and use deletion restrictions.
- Use protected server functions and private QR storage with validated PNG/JPG uploads. Existing routes and new Quotations navigation get appropriate page metadata.
- Keep conversion atomic and retry-safe, with source linkage separate from return/purchase source semantics so existing return safeguards remain intact.

## Verification
- Add and run focused tests for exact quotation conversion, duplicate retries, customer snapshots, no stock/accounting/points effects before confirmation, credit-limit boundaries and statement balance direction.
- Run isolated database authorization/branch tests and existing commerce/party/print regressions; no synthetic live business records.
- Check signed-in desktop/mobile entry, statement sharing and printable QR layouts. Live conversion/QR verification needs a legitimate quotation and the real payment QR; WhatsApp delivery and actual payment remain user-confirmed.

## Outside this bundle
- Automatic WhatsApp sending, payment verification, payment-provider onboarding, automatic reminders, credit blocking and quotation deposits.