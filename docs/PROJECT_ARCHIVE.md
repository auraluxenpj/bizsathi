# BizSathi Project Archive

> **Purpose:** This is the central, continuously maintainable project reference for BizSathi Nepal. Update it when a feature is proposed, implemented, merged, tested, deployed, or retired.
>
> **Last consolidated:** 16 November 2026  
> **Repository:** [auraluxenpj/bizsathi](https://github.com/auraluxenpj/bizsathi)  
> **Default branch:** `main`  
> **Live app:** https://bizsathinepal.app/dashboard  
> **Lovable editor:** https://lovable.dev/projects/91d3bad1-4fef-49f9-8131-e40dddcbf188  
> **Preview:** https://id-preview--91d3bad1-4fef-49f9-8131-e40dddcbf188.lovable.app

## 1. Project identity and boundaries

BizSathi Nepal is a separate Karobar-style business management application. It is not the AURALUXE retail website or AURALUXE production system.

- GitHub: `auraluxenpj/bizsathi`
- Lovable workspace: `033848f03042fac2dbd3` (AURALUXE's Lovable)
- Lovable project: `91d3bad1-4fef-49f9-8131-e40dddcbf188` (Bizsathi)
- Supabase project visible to connected tools: `efcxhbyaazfvpbaxyvpu` (Tokyo staging)
- Production Supabase is not connected to the available tools.

**Non-negotiable separation:** Never modify AURALUXE production data while working on BizSathi. Do not assume the connected staging Supabase project is production.

## 2. Working preferences and safety rules

- Prefer GitHub-based implementation over consuming Lovable AI credits.
- Work incrementally; avoid broad rewrites and unnecessary dependencies.
- Use staging/preview first. Preserve existing data and workflows.
- Do not run production migrations, alter production records, or publish/deploy to production without explicit approval.
- Do not modify inventory, stock, invoices, payments, financial balances, user access, or settings as part of UI-only work.
- Keep the user informed about what is actually merged, synced to Lovable, published, and verified. These are separate states.
- Report tests and CI accurately; never claim a visual/browser test or screenshot exists unless it was actually produced.
- User has authorized routine PR merges after validation/CI passes; no need to repeatedly ask for merge permission in that situation.
- The user prefers practical next steps and concise progress reports.

## 3. Product vision

Build a Karobar-style, mobile-friendly business suite with:
- Responsive customer/business interface and mobile-friendly admin.
- Separate staff accounts and role-based access, while authorized admins share the same inventory and backend (no duplicate stock).
- Inventory, barcode operations, POS, sales/purchase documents, ledgers, expenses, accounting, and reports.
- Support for multiple branches and several billing counters.
- POS payment modes including cash, QR/digital payments, and credit/udhar.
- Receipt printing and barcode hardware support.
- A future offline-capable PWA workflow for billing on desktop and mobile, with safe later synchronization.
- Strong auditability and secure branch-level permissions.

Offline billing/sync and full hardware reliability remain goals, not confirmed completed capabilities.

## 4. Application navigation and feature map

Current/known navigation areas from the code audit:

| Area | Known pages/features | Notes |
|---|---|---|
| Items & Masters | Products, Categories, Suppliers, Customer Contacts, Barcode Studio | Brands was noted as unavailable in the audit |
| CRM | Customers, Membership & Loyalty | Further redemption/return flows need review |
| Invoices | Barcode POS, Sale Invoices, Purchase Invoices, Purchase Orders | Validate complete end-to-end workflow |
| Returns | Sale Returns, Purchase Returns | Validate stock and payment effects |
| Stock & Inventory | Physical Inventory Count, Stock Adjustments, Quarantine & Disposal | Batch & Expiry and Stocktake Sessions were noted as unavailable/partial |
| Finance & Ledgers | Customer Ledger, Supplier Ledger, Payment Vouchers, Cash Drawer, Financial Accounts, Operating Expenses, Double-Entry & GL | Reconcile end-to-end |
| Reports | Net Profit P&L, Cost of Sale, Sale Detail, Purchase Detail, Current Stock, Low Stock & Reorder, Stock Adjustment | Verify calculations against transactions |
| System & Settings | Settings, Users, Roles, Team Access | Verify branch and role restrictions |

Menu contents can evolve; check the current code before treating this map as a definitive live inventory.

## 5. Completed GitHub work

The following changes were recorded as merged into GitHub `main`. A merge does **not** by itself prove Lovable sync, production publishing, or real-device validation.

### Inventory count and reconciliation

| PR | Change | Key behavior |
|---|---|---|
| #48 | Manual inventory count sheet | System qty vs entered physical qty, variance, unit cost, system/physical value and difference; count date/team member; CSV/PDF export; blank physical qty means uncounted; read-only draft initially |
| #49 | Persistent count sessions/review | Save drafts across refresh; reopen history by branch/date/team; submit for review; approve/reject with reviewer/time/note; preserve system-stock snapshot; approval does not itself adjust stock. Staging migrations 0050/0051 were applied to Tokyo staging only; tables were empty at the time |
| #50 | Keyboard barcode scanning | USB/Bluetooth keyboard-wedge scanner; exact barcode/SKU match; scan + Enter increments physical count by one; manual editing remains |
| #51 | Inventory sidebar placement | Physical Inventory Count added under Stock & Inventory |
| #52 | Cost price display/export | Permission-controlled read-only cost price; system value; cost/value fields in CSV/PDF; saved count uses cost snapshot |
| #55 | Difference value correction | Variance = Physical − System; difference value = variance × unit cost; shortage negative, surplus positive; blank physical qty stays blank. Supersedes earlier PR #53 sign logic |
| #54 | Stock workspace tabs | Separate views for Stock on hand, Stock ledger, Manual inventory count, Physical count reconciliation |
| #56 | Cost permission and legacy fallback | Explicit permission-checked `canViewPurchasePrice`; server-side masking when denied; authorized fallback to product purchase price for old null snapshots; unavailable cost displays as —, not false zero |
| #57 | Whole-unit quantities | Physical count accepts integers only; fractions rejected in UI/server; display whole units; historical counts preserved |
| #58 | Mobile camera barcode scanning | Camera scan beside keyboard scan; rear camera preferred; exact barcode/SKU matching; camera released after close/scan; HTTPS and camera permission required; BarcodeDetector support varies |
| #61 | Portrait camera scanner | Camera feed requests portrait orientation (9:16, 720×1280); vertical preview; applies to Physical Inventory Count and POS scanner |

**Important inventory rules**
- A barcode/SKU scan adds one unit to the physical count; it does not post stock.
- Physical count approval is a review workflow, not an inventory adjustment.
- Variance = physical quantity minus system quantity.
- Difference value = variance multiplied by cost per unit.
- Blank physical quantity means not counted, not zero.
- Whole-unit count quantities only.
- Cost price is sensitive and must remain permission-controlled and masked server-side when unauthorized.

### Team access, navigation and responsive UI

| PR | Change | Key behavior |
|---|---|---|
| #59 | Consolidated staff invitations into Team Access | Team Access & Delegation is the single invitation-creation location; preserved invitation history/status, role change, revoke/reissue, copy/WhatsApp sharing and acceptance routes |
| #60 | Team Access accordion layout | Five collapsible sections: Branch delegation, Invite team member, Invitation history, Role hierarchy, Role permissions; collapsed by default and one major section expanded at a time |
| #62 | Mobile inventory navigation | Six inventory tabs use a two-column grid on mobile; wrapped text and full-width targets; larger screens retain flex-wrap tabs |
| #63 | Trilingual How to Use guide | Authenticated `/help` route, linked from More; detailed guide in English, Hindi and Nepali; language selector; print / Save as PDF for selected language |
| #64 | Removed unnecessary What's New update | Removed the What's New update notes section from the More area; appearance settings, financial-year controls and sign-out retained |

### Additional known implementation notes

- PR #56 addressed a cost-price masking/fallback issue, but the actual live value still needs verification against the user's permissions and the product's saved purchase price.
- PR #58 and #61 require a real-phone camera test after sync/publish.
- PR #59 invitation creation may still depend on the production RPC `create_team_invitation` having the correct migration/function signature/grants. Staging verification does not prove production readiness.
- PR #63 help route is `/help`; verify Lovable sync and that the live app route is reachable before calling it deployed.
- PR #64 merge commit was reported as `fb7070cc`; verify exact full SHA in GitHub when maintaining this archive.

## 6. Key calculation and workflow decisions

### Physical count example
For product ANUSHREE41 - 039 / STANDARD · AL-KURTI-039:
- System quantity: 2
- Physical quantity: 1
- Unit cost: Rs 1,331
- System value: Rs 2,662
- Physical value: Rs 1,331
- Variance: -1
- Difference value: -Rs 1,331

If the app shows cost as zero or —, first verify the user's See Purchase Price permission and the saved product purchase price. Do not bypass permission checks.

### Barcode scanning
- Support USB/Bluetooth scanners in keyboard mode.
- Also support mobile camera scanning.
- Mobile camera preview should be portrait, not landscape.
- Prefer rear-facing camera.
- A successful scan should resolve the exact barcode/SKU and increment by one in a count workflow.
- Do not treat scanning as a stock movement unless a separate approved posting workflow explicitly does so.

## 7. User guide

The guide is intended to be available inside the authenticated app:
- Route: `/help`
- Navigation: More → How to use BizSathi
- Languages: English, हिन्दी, नेपाली
- Print / Download PDF: browser print dialog; user can choose Save as PDF. The currently selected language is printed.

Links:
- [Live dashboard](https://bizsathinepal.app/dashboard)
- [Help route](https://bizsathinepal.app/help)
- [GitHub PR #63](https://github.com/auraluxenpj/bizsathi/pull/63)

## 8. Known issues and verification backlog

These are known or previously raised items; confirm current status before making changes.

| Priority | Item | What to verify / do |
|---|---|---|
| High | Full responsive visual QA | Inspect desktop, tablet and mobile across dashboard, products, parties, stock tabs, Team Access, POS, invoices, ledgers, reports and settings. Capture genuine screenshots. Previous Lovable visual audit attempt was blocked because workspace had no credits; no screenshots were produced |
| High | Staff invitation creation | Verify production RPC `create_team_invitation`, function signature, grants and invite acceptance end-to-end; do not infer production state from staging |
| High | Inventory cost visibility | Verify role permission and purchase price for the reported product; confirm authorized users see Rs 1,331 and unauthorized staff receive no sensitive cost data |
| High | Camera scanner | Test portrait camera scanning on actual Android/iOS devices, HTTPS permissions, exact match, camera release, and low-light/focus behavior |
| High | Lovable sync/publish | Compare Lovable latest commit with GitHub main, then separately verify published live app and routes |
| Medium | POS hardware | Test real barcode scanners, receipt printers, printer paper/layout, counter workflows and mobile use |
| Medium | POS payment lifecycle | Validate cash, QR/digital, credit/udhar, split payments, failed payment recovery, cashier opening/closing and cash reconciliation |
| Medium | Returns | Confirm sale/purchase returns correctly affect stock, ledgers, refunds and reports |
| Medium | Stocktake completion | Build/complete batch & expiry, stocktake progress, reconciliation and safe adjustment posting where needed |
| Medium | Damaged/quarantine | Complete quarantine/damaged stock workflows and audit trail |
| Medium | Reorder | Reorder levels, low-stock alerts and purchase suggestions |
| Medium | Accounting | Validate COGS, profit, opening balances, classifications, trial balance, balance sheet, cash flow, VAT/tax and invoice-payment reconciliation |
| Medium | CRM/loyalty | Validate reward redemption, points on returns/refunds, purchase history, balances and WhatsApp statements/reminders |
| Medium | Branch and role security | Test each role's branch scope and sensitive actions, including purchase price masking and cashier restrictions |
| Medium | Website inventory sync | A BizSathi-to-website inventory sync 401 was previously unresolved/unverified |

## 9. Recommended delivery order

1. Confirm GitHub main, Lovable sync, and live publish status for merged changes.
2. Run responsive visual QA with screenshots once browser/preview access is available.
3. Fix and test staff invitations end-to-end.
4. Verify purchase-price permission and inventory count calculations.
5. Test barcode scanning and POS hardware on real devices.
6. Validate the full sales → payment → ledger → accounting → report chain.
7. Complete stocktake, batch/expiry, quarantine and reorder workflows.
8. Improve loyalty/CRM and customer statements.
9. Design and test offline POS plus safe conflict-aware synchronization.

## 10. Environment and data safety notes

- The available Supabase connector was pointed at Tokyo staging project `efcxhbyaazfvpbaxyvpu`; production Supabase was not connected.
- BizSathi staging was separately described as Tokyo PostgreSQL 17.11.0.003.
- A prior staging audit reported 8 security groups passed.
- Never treat staging test results as production proof.
- No production data changes are implied by the merged GitHub UI/feature PRs listed above.
- Any future migration must be reviewed for backward compatibility, tested on staging, backed up, and explicitly approved before production execution.

## 11. Change log maintenance template

Append a dated entry whenever work progresses:

### YYYY-MM-DD — Short change title
- **Request / problem:**
- **Decision:**
- **Files / modules:**
- **PR / commit:**
- **Tests / CI:**
- **Database / migration impact:**
- **Lovable sync:**
- **Publish / deployment:**
- **Live verification:**
- **Remaining work:**

---

**Archive discipline:** Keep this document factual. Mark items as proposed, in progress, merged, synced, published, tested, or verified. Record exact PRs/SHAs and dates where available. Do not silently turn an unverified item into a completed feature.
