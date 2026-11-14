# Karobar-style navigation and dashboard

## Audit findings
- Reviewed Karobar’s actual sidebar, dashboard layout, dashboard code and dashboard screenshot from the supplied repository. Its current sidebar supports grouped, collapsible navigation, a menu filter and a compact mode; the screenshot shows a light enterprise dashboard with a fixed sidebar, top bar, KPI cards and trend charts.
- BizSathi already has products, categories, customers/suppliers, barcode printing, POS, sales/purchases, purchase orders, source-linked returns, stock adjustments/disposals, ledgers, vouchers, cash counters, accounts, expenses, reports and staff administration.
- Brands, batch/expiry tracking, stocktake sessions and a separate quarantine workflow are not existing operational modules. Disposal exists, but quarantine does not. Roles are managed through existing staff permissions, not a separate role-creation system.
- The shared shell currently omits POS, quotations and purchase orders from its page list. These existing pages must receive the same navigation shell.

## Phase 1: navigation shell
- Match Karobar’s clean sidebar/top-bar format while keeping BizSathi/Auraluxe branding, existing sign-in and existing business/branch permissions.
- Use these exact group names and menu order:
  - **Items & Masters:** Products, Categories, Brands, Suppliers, Customers, Barcode Studio.
  - **Invoices:** Barcode POS, Sale Invoices, Purchase Invoices, Purchase Orders.
  - **Returns:** Sale Returns, Purchase Returns.
  - **Stock & Inventory:** Batch & Expiry, Stock Adjustments, Stocktake Sessions, Quarantine & Disposal.
  - **Finance & Ledgers:** Customer Ledger, Supplier Ledger, Payment Vouchers, Cash Drawer, Financial Accounts, Operating Expenses, Double-Entry & GL.
  - **Reports:** Net Profit P&L, Cost of Sale, Sale Detail, Purchase Detail, Current Stock, Low Stock & Reorder, Stock Adjustment.
  - **System & Settings:** Settings, Users, Roles.
- Add collapsible groups, a menu search, clear selected-page highlighting, a compact desktop sidebar with an always-visible reopen control, and a mobile navigation drawer.
- Link supported entries to their existing screens and relevant selected views. Customer/supplier and return links will select the corresponding existing workflow rather than duplicate it. Barcode Studio opens the existing barcode tools.
- Preserve report date/branch selections when switching report links; distinguish active report entries by selected report, not just page address.
- Show unsupported modules as disabled, clearly marked **Not available**, rather than linking to unrelated screens or inventing working features. Quarantine & Disposal opens existing disposal controls with a clear quarantine limitation. Users and Roles reuse existing staff/permission administration.
- Keep all existing URLs working. Retain access to quotations, transactions, other reports, profile and administrator security tools through a supplementary workspace menu, without changing the seven requested groups.

## Phase 2: dashboard
- Rebuild the first screen into a business overview with a compact heading, authorized branch selection, period selection, KPI cards, trend charts, recent activity and quick shortcuts.
- Display real net sales, purchases, expenses, receivables/payables and cash/bank figures using existing authorized queries and exact-money helpers. No sample balances or invented growth percentages.
- Show revenue and expense trends from recorded sales/returns and expense evidence, with clear period labels and honest empty/loading/error states.
- Use the existing confirmed documents for recent activities and existing authorized operations for quick actions.
- Keep privacy mode and low-stock visibility. Match Karobar’s hierarchy and spacing using BizSathi’s theme tokens, rather than importing its separate framework or backend.

## Technical approach and safety
- Frontend-only changes: shared root shell, small navigation configuration/components, dashboard presentation and URL-selected views on existing screens where needed.
- Keep TanStack routing, existing query functions, report engines, posting operations, permissions and database schema unchanged.
- No migrations, imports, live stock changes, financial postings, deployment or domain changes.
- Preserve existing page titles/social metadata and add specific metadata only for any genuinely needed new view route.

## Verification
- Run focused navigation/dashboard tests, including active views, preserved report filters and existing route coverage.
- Check the signed-in dashboard and existing Products, POS, sales, purchase orders, returns, report and staff destinations against actual records without saving transactions.
- Verify group expansion/search, desktop collapse/reopen, mobile drawer, readable charts, no horizontal overflow, and current app error logs.
- Report any unavailable module or live check that remains blocked; do not describe a navigation link as a newly implemented business module.

## Outside this change
New brands, batch/expiry, stocktake or quarantine business modules; new role privileges; database redesign; and unrelated unfinished loyalty or website-sync work.