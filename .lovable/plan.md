# Purchase Orders

## What you get
- A new **Purchase Orders** page: create a draft order for a supplier and branch, pick products with quantities and expected cost, add an expected delivery date and notes.
- **Send to supplier**: marks the order as Sent and opens WhatsApp (or copy text) with a formatted order summary for you to send. Nothing is sent automatically.
- **Pending shipments** view: filter orders by Draft, Sent, Partly received, Received, Cancelled, with overdue expected dates highlighted.
- **Convert to Purchase Bill** (one click): creates an unconfirmed purchase bill linked to the order with the same supplier, items, quantities and prices. You review and confirm it through the existing purchase flow; stock, payments and accounting only change on confirmation.
- Orders can be edited while Draft, cancelled before conversion, and printed.

## Rules
- Purchase orders do not move stock or post accounting entries.
- Only managers/administrators with access to the branch can create, send, convert or cancel; others can view if they have branch access.
- Each order converts to at most one bill; retries never create duplicates. Converted or cancelled orders are locked.
- Goods receiving stays a separate step, as today, so purchases are never received twice.

## Technical details
- New `purchase_orders` table mirroring `quotations` (business/branch/supplier, reference, dates, status, supplier snapshot, lines jsonb, total, revision, bill_id, request, actor), RESTRICT FKs, revoke defaults + least-privilege grants, branch RLS via `can_access_branch`, writes only through SECURITY DEFINER RPCs.
- RPCs: `save_purchase_order` (revision-checked, idempotent), `set_purchase_order_status` (send/cancel), `convert_purchase_order` (locks row under the shared business lock and open-period check, calls `post_commerce_document` with kind `purchase`, status `draft`, linking `purchase_order_id`).
- Add nullable `commerce_documents.purchase_order_id` plus a guard trigger like the quotation link guard.
- Files: `src/lib/purchase-orders.ts` (Zod + Decimal totals), `purchase-orders.functions.ts` (requireSupabaseAuth), `src/components/purchase-orders.tsx`, route `/_authenticated/purchase-orders`, nav entry.
- Tests: unit tests for totals/status transitions; SQL isolation tests for tenant/branch isolation, role checks, single conversion and retry safety.
- Docs: `supabase/PURCHASE_ORDERS.md`; AGENTS.md rule.
