import { describe, expect, it } from 'vitest';
import { allowedActions, countOnDay, dashboardKind, entryDayCounts, localDay, openDrawer, saleDayTotals } from './dashboard-profile';
import { isBillingStaff } from './workspace-navigation';

describe('dashboardKind', () => {
  const perms = (...allowed: string[]) => (permission: string) => allowed.includes(permission);

  it('derives cashier, stock and entry workspaces from effective permissions', () => {
    const cashier = perms('sales.create','sales.view','customers.create','customers.view','inventory.view','categories.view');
    const stock = perms('inventory.view','inventory.edit','stock.edit');
    const entry = perms('sales.create','purchases.create');
    expect(dashboardKind(cashier)).toBe('cashier');
    expect(dashboardKind(stock)).toBe('stock');
    expect(dashboardKind(entry)).toBe('entry');
  });

  it('keeps business administrators and finance roles on the business overview', () => {
    expect(dashboardKind(perms('reports.view','reports.home_stats','sales.create'))).toBe('business');
    expect(dashboardKind(perms('accounts.view','purchases.view'))).toBe('business');
    expect(dashboardKind(perms('settings.edit','sales.create'))).toBe('business');
  });

  it('falls back to the business overview for unknown or missing permissions', () => {
    expect(dashboardKind(perms())).toBe('business');
  });

  it('agrees with the permission-based billing-staff rule used for navigation', () => {
    const cashier = perms('sales.create','sales.view','customers.create','customers.view','inventory.view','categories.view');
    expect(dashboardKind(cashier) === 'cashier').toBe(isBillingStaff(cashier));
    const accountant = perms('sales.create','purchases.view','accounts.view','reports.view');
    expect(dashboardKind(accountant) === 'cashier').toBe(isBillingStaff(accountant));
  });
});

describe('saleDayTotals', () => {
  const doc = (kind: string, total: number, date = '2026-11-17', status = 'confirmed') => ({ kind, status, total, document_date: date });

  it('nets confirmed returns off confirmed sales for the chosen day only', () => {
    const totals = saleDayTotals([doc('sale', 100.1), doc('sale', 200.2), doc('sale_return', 50.05), doc('sale', 999, '2026-11-16'), doc('sale', 999, '2026-11-17', 'draft'), doc('purchase', 777)], '2026-11-17');
    expect(totals).toEqual({ bills: 2, returns: 1, net: 250.25 });
  });

  it('does not drift on repeated cents', () => {
    expect(saleDayTotals(Array.from({ length: 10 }, () => doc('sale', 0.1)), '2026-11-17').net).toBe(1);
  });

  it('is zero when nothing was sold', () => {
    expect(saleDayTotals([], '2026-11-17')).toEqual({ bills: 0, returns: 0, net: 0 });
  });
});

describe('entryDayCounts', () => {
  const doc = (kind: string, actor: string | null, status = 'confirmed', date = '2026-11-17') => ({ kind, status, total: 10, document_date: date, actor_id: actor });

  it('counts only this member\'s confirmed sales and purchases for the day', () => {
    const rows = [doc('sale', 'me'), doc('sale', 'me'), doc('purchase', 'me'), doc('sale', 'someone-else'), doc('sale', 'me', 'draft'), doc('purchase', 'me', 'confirmed', '2026-11-01'), doc('sale', null)];
    expect(entryDayCounts(rows, 'me', '2026-11-17')).toEqual({ sales: 2, purchases: 1 });
  });
});

describe('openDrawer', () => {
  const event = (kind: string, session: string, actor: string | null = 'me') => ({ kind, session_id: session, actor_id: actor });

  it('finds the member\'s own open, unclosed session', () => {
    expect(openDrawer([event('open', 's1')], 'me')?.session_id).toBe('s1');
  });

  it('ignores closed sessions and other people\'s drawers', () => {
    expect(openDrawer([event('open', 's1'), event('close', 's1')], 'me')).toBeUndefined();
    expect(openDrawer([event('open', 's2', 'someone-else')], 'me')).toBeUndefined();
    expect(openDrawer([], 'me')).toBeUndefined();
  });

  it('still finds a later session after an earlier one was closed', () => {
    expect(openDrawer([event('open', 's1'), event('close', 's1'), event('open', 's2')], 'me')?.session_id).toBe('s2');
  });
});

describe('local days', () => {
  it('turns a mid-day timestamp into its calendar day and rejects junk', () => {
    expect(localDay('2026-11-17T06:00:00Z')).toBe('2026-11-17');
    expect(localDay('not a date')).toBe('');
  });

  it('counts rows that fall on the day', () => {
    const rows = [{ created_at: '2026-11-17T06:00:00Z' }, { created_at: '2026-11-17T07:30:00Z' }, { created_at: '2026-11-10T06:00:00Z' }, { created_at: 'bad' }];
    expect(countOnDay(rows, '2026-11-17')).toBe(2);
  });
});

describe('allowedActions', () => {
  const actions = [{ to: '/pos', permission: 'sales.create' }, { to: '/parties' }, { to: '/products', permission: 'inventory.create' }, { to: '/reports' }];

  it('needs both the page and the action permission', () => {
    const shown = allowedActions(actions, to => to !== '/reports', permission => permission !== 'inventory.create');
    expect(shown.map(a => a.to)).toEqual(['/pos', '/parties']);
  });

  it('shows nothing while access is unknown (fail closed)', () => {
    expect(allowedActions(actions, () => false, () => false)).toEqual([]);
  });
});
