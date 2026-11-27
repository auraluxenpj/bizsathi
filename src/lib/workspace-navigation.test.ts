import { describe, expect, it } from 'vitest';
import { isBillingStaff, shouldRedirectBillingStaff, workspaceGroups, workspaceItemActive, workspaceItemSearch } from './workspace-navigation';
import { documentInSelectedView } from './workspace-views';
import { dashboardTrends } from './dashboard-trends';
describe('workspace navigation preserves existing workflows', () => {
 it('identifies permission-limited sales users as dedicated billing users', () => {
  const cashier = (p: string) => ['sales.create','sales.view','customers.create','customers.view','inventory.view','categories.view'].includes(p);
  const stockManager = (p: string) => ['inventory.view','inventory.edit','stock.edit'].includes(p);
  const accountant = (p: string) => ['sales.create','purchases.view','accounts.view','reports.view'].includes(p);
  expect(isBillingStaff(cashier)).toBe(true);
  expect(isBillingStaff(p => cashier(p) || p === 'expenses.view')).toBe(false);
  expect(isBillingStaff(stockManager)).toBe(false);
  expect(isBillingStaff(accountant)).toBe(false);
 });
 it('confines POS-only billing staff to the POS terminal', () => {
  expect(shouldRedirectBillingStaff('/pos')).toBe(false);
  expect(shouldRedirectBillingStaff('/rental')).toBe(false);
  for (const path of ['/dashboard','/cash-counters','/sales','/parties','/membership','/hrm','/purchases','/products','/reports','/businesses']) {
   expect(shouldRedirectBillingStaff(path)).toBe(true);
  }
 });
 it('selects each report destination independently and retains branch and dates', () => {
  const sales = workspaceGroups.flatMap(g => g.items).find(i => i.name === 'Sale Detail');
  const cost = workspaceGroups.flatMap(g => g.items).find(i => i.name === 'Cost of Sale');
  if (!sales || !cost) throw new Error('Missing report destination');
  const current = { view: 'profit', from: '2026-11-01', to: '2026-11-14', branch: 'nepalgunj', business: 'auraluxe' };
  expect(workspaceItemSearch(sales, '/accounting', current)).toMatchObject({ view: 'sales', from: '2026-11-01', to: '2026-11-14', branch: 'nepalgunj', business: 'auraluxe' });
  expect(workspaceItemActive(sales, '/accounting', { view: 'sales', focus: 'cost' })).toBe(false);
  expect(workspaceItemActive(cost, '/accounting', { view: 'sales', focus: 'cost' })).toBe(true);
 });
 it('returns select the existing source-linked document kind only', () => {
  expect(documentInSelectedView('sale', 'sale_return', 'sale_return')).toBe(true);
  expect(documentInSelectedView('sale', 'sale_return', 'sale')).toBe(false);
  expect(documentInSelectedView('purchase', 'purchase_return', 'purchase')).toBe(false);
  expect(documentInSelectedView('purchase', 'purchase_return', 'purchase_return')).toBe(true);
 });
 it('trend amounts use confirmed net sales, exact expenses, selected dates and authorized branch', () => {
  const doc = { kind: 'sale', status: 'confirmed', total: 100.10, branch_id: 'one', document_date: '2026-11-14' };
  const journal = { account_code: 'expense_rent', debit: 0.1, credit: 0, branch_id: 'one', entry_date: '2026-11-14' };
  const rows = dashboardTrends({ documents: [doc, { ...doc, kind: 'sale_return', total: 20.05 }, { ...doc, status: 'draft', total: 900 }, { ...doc, branch_id: 'two', total: 800 }], journals: [journal, { ...journal, debit: 0.2 }, { ...journal, branch_id: 'two', debit: 99 }] }, 'one', '2026-11-13', '2026-11-14');
  expect(rows).toEqual([{ date: '2026-11-13', revenue: 0, expense: 0 }, { date: '2026-11-14', revenue: 80.05, expense: 0.3 }]);
 });
 it('groups daily workflows into dedicated Sales, Purchases, Inventory, Finance and Reporting sections', () => {
  expect(workspaceGroups.map(group => group.name)).toEqual(['Sales & POS', 'Purchases', 'Stock & Inventory', 'Customers & Loyalty', 'Finance', 'Reporting', 'HR & People Management', 'Settings', 'Property Management', 'Security']);
  const items = (group: string) => workspaceGroups.find(entry => entry.name === group)?.items ?? [];
  expect(items('Sales & POS').map(item => item.name)).toEqual(expect.arrayContaining(['Barcode POS', 'Sale Invoices', 'Sale Returns', 'Quotations & Estimates']));
  expect(items('Purchases').map(item => item.name)).toEqual(expect.arrayContaining(['Purchase Invoices', 'Purchase Orders', 'Purchase Returns', 'Suppliers']));
  expect(items('Stock & Inventory').map(item => item.name)).toEqual(expect.arrayContaining(['Products', 'Categories', 'Barcode Studio', 'Stock Adjustments']));
  expect(items('Customers & Loyalty').map(item => item.name)).toEqual(expect.arrayContaining(['Customers', 'Customer Contacts', 'Membership & Loyalty']));
  expect(items('Finance').map(item => item.name)).toEqual(expect.arrayContaining(['Cash Drawer', 'Financial Accounts', 'Operating Expenses', 'Payment Vouchers']));
  expect(items('Reporting').map(item => item.name)).toEqual(expect.arrayContaining(['Customer Ledger', 'Supplier Ledger', 'Net Profit P&L', 'Current Stock']));
  expect(items('HR & People Management').map(item => item.name)).toEqual(expect.arrayContaining(['HR & People Management', 'Employees & Branch Access', 'Roles & Permissions']));
  expect(items('Settings').map(item => item.name)).toEqual(['Auraluxe & App Settings']);
  expect(items('Property Management').map(item => item.name)).toEqual(['Rental Property Management']);
  expect(items('Security').map(item => item.name)).toEqual(['Security Findings', 'Review History']);
 });

});
