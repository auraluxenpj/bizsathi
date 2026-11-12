# Custom staff permission checklist

## What you get
- In **Team access → Staff permissions**, each member gets an **Edit permissions** button that opens a checklist grouped by header, like Karobar:
  - Sales (Sales, Quotation, Payment in, Sales return): Create, Edit, View
  - Purchases (Purchase, Purchase order, Payment out, Purchase return): Create, Edit, View
  - Income & Expenses: Create, View
  - Customers / Suppliers: Create, Edit, View
  - Products & Stock: Create, Edit, View, Import bulk
  - Reports: View
  - Manage staff: View
- Ticks start from the member's current role (staff, accountant, admin). Owners/admins can **untick** items to limit someone further, then tap **Done**.
- "Delete" items are not shown: posted bills and vouchers can't be deleted in BizSathi, only returned or reversed.

## Rules
- The checklist can only take permissions away; it can never give more than the person's role allows. Roles stay the source of truth, so nobody can raise their own access.
- Only the owner or an administrator can change a member's checklist, and not their own.
- Removed permissions hide the matching buttons and are also refused by the server, so they can't be bypassed.
- Changes are recorded in the audit history.

## Technical details
- New table `member_permission_denials(business_id, user_id, permission, granted_by, created_at)`, unique per member+permission, RESTRICT FKs, least-privilege grants, member-read RLS; writes only through SECURITY DEFINER `set_member_permissions(_business, _user, _denied text[])` that checks admin rank, blocks self-edits and outranking, and writes audit rows.
- Helper `has_permission(_business, _perm)` = role allows it AND no denial row; role defaults defined in one SQL function and mirrored in `src/lib/permissions.ts`.
- Enforce at existing entry points: `post_commerce_document*` (sale/purchase families by kind), `post_commerce_payment*`, `save_quotation`, voucher/expense RPCs, party and product writes, catalogue import. Each gets one added `has_permission` check.
- UI: `PermissionChecklist` dialog in `business-access.tsx`; server functions to read/save; `usePermissions` hook to hide buttons.
- Tests: unit tests for role defaults and restrict-only merging; SQL test that a denied staff member cannot create a sale and cannot self-edit.
