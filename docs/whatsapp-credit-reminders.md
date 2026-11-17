# Sutra WhatsApp credit reminders — implementation notes

This branch introduces only the database foundation. It intentionally does not send WhatsApp messages, enable a schedule, or change existing invoice/receipt sharing.

## Safety and accounting rules

- Customer consent is explicit and defaults to false. Store opt-in and opt-out timestamps.
- A scheduled cycle is unique per business, customer, and ISO week.
- The worker must calculate the current receivable from confirmed commerce documents, returns, and payments at send time. Never trust a client-supplied balance.
- Send only to active customer records with a valid phone number, explicit opt-in, positive balance, and an approved Meta template.
- Tenant isolation and branch visibility must be checked server-side.
- Manual sends require the existing customer-management permission; schedule changes require settings permission. A future permission-catalog change can split these into narrower controls after the permission-denial constraint is safely migrated.
- Provider credentials belong in Supabase secrets, never in browser code or Git.
- No message is sent until a business administrator explicitly enables the feature after Meta configuration.
- Delivery callbacks must verify Meta signatures and update only the matching provider message.
- Keep provider errors safe: never log access tokens, message bodies containing personal data, or signed storage URLs.

## Remaining implementation before activation

1. Add the server-side manual-send endpoint and scheduled worker using Meta WhatsApp Cloud API.
2. Add a signed webhook for delivery/read/failure callbacks.
3. Add the weekly scheduler using the business timezone and an idempotent claim operation.
4. Add UI for customer consent, manual reminder preview/send, schedule controls, and message history.
5. For invoice/receipt sharing, generate or reuse the actual PDF bytes, place them in private storage, issue a short-lived signed URL, and send as a WhatsApp document. The existing `wa.me` text-share is not a PDF attachment.
6. Add integration tests for consent, opt-out, tenant isolation, balance recalculation, idempotency, retries, rate limits, and permission denial.
7. Configure Meta Business Account, phone-number ID, access token, approved templates, and webhook secrets directly in the target Supabase project.

## Current state

This migration creates opt-in fields, business schedule settings (disabled by default), and an auditable send-history table. It does not schedule jobs or expose a send endpoint. Do not mark the feature live until all remaining items are implemented and verified.
