import { describe, expect, it } from 'vitest';
import { rolePresets, routePermission, permissionForRoute } from './permissions';
import { shouldRedirectBillingStaff } from './workspace-navigation';

describe('least-privilege employee workspace access', () => {
  it('keeps the base Staff access role limited to POS and its in-screen lookups', () => {
    const allowed = rolePresets.staff?.allowed ?? [];
    expect(allowed).toEqual(expect.arrayContaining(['sales.create','sales.view','inventory.view','categories.view','customers.view','customers.create']));
    expect(allowed).not.toContain('purchases.view');
    expect(allowed).not.toContain('accounts.view');
    expect(allowed).not.toContain('hr.employees.view');
    expect(allowed).not.toContain('inventory.edit');
  });

  it('guards module routes with their own effective permission', () => {
    expect(routePermission['/pos']).toBe('sales.create');
    expect(routePermission['/sales']).toBe('sales.view');
    expect(routePermission['/products']).toBe('inventory.view');
    expect(routePermission['/businesses']).toBe('staff.view');
    expect(permissionForRoute('/contacts',{kind:'supplier'})).toBe('suppliers.view');
    expect(permissionForRoute('/contacts',{kind:'customer'})).toBe('customers.view');
  });

  it('redirects POS-only staff from every page except the POS terminal', () => {
    expect(shouldRedirectBillingStaff('/pos')).toBe(false);
    for (const path of ['/dashboard','/cash-counters','/sales','/parties','/membership','/hrm','/purchases','/inventory','/reports','/businesses']) {
      expect(shouldRedirectBillingStaff(path)).toBe(true);
    }
  });
});
