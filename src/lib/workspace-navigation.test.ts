import { describe, expect, it } from 'vitest';
import { workspaceGroups, workspaceItemActive, workspaceItemSearch } from './workspace-navigation';
import { documentInSelectedView } from './workspace-views';
import { dashboardTrends } from './dashboard-trends';
describe('workspace navigation preserves existing workflows', () => {
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
});