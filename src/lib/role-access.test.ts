import { describe, expect, it } from 'vitest';
import { jobTitles } from './job-titles';
import { rolePresets, routePermission } from './permissions';
import { shouldRedirectBillingStaff } from './workspace-navigation';

describe('cashier and Branch Manager workspace access', () => {
  it('gives Sales Person POS, CRM and membership read access without stock or finance tools', () => {
    const allowed = jobTitles.sales_person.allowed;
    expect(allowed).toContain('sales.create');
    expect(allowed).toContain('sales.view');
    expect(allowed).toContain('customers.view');
    expect(allowed).toContain('customers.create');
    expect(allowed).toContain('inventory.view');
    expect(allowed).not.toContain('sales.edit');
    expect(allowed).not.toContain('inventory.create');
    expect(allowed).not.toContain('expenses.create');
    expect(allowed).not.toContain('reports.home_stats');
  });

  it('gives Branch Managers POS and CRM access while preserving branch-only limits', () => {
    expect(jobTitles.branch_manager.allowed).toContain('sales.create');
    expect(jobTitles.branch_manager.allowed).toContain('sales.view');
    expect(jobTitles.branch_manager.allowed).toContain('customers.view');
    expect(jobTitles.branch_manager.allowed).toContain('customers.create');
    expect(jobTitles.branch_manager.allowed).toContain('customers.edit');
    expect(rolePresets.branch_manager.allowed).toContain('customers.create');
    expect(rolePresets.branch_manager.allowed).toContain('customers.edit');
    expect(rolePresets.branch_manager.allowed).toContain('sales.create');
    expect(rolePresets.branch_manager.allowed).toContain('sales.view');
    expect(rolePresets.branch_manager.allowed).not.toContain('purchases.create');
    expect(rolePresets.branch_manager.allowed).not.toContain('accounts.view');
  });

  it('guards the POS, cash drawer and membership routes by matching permissions', () => {
    expect(routePermission['/pos']).toBe('sales.create');
    expect(routePermission['/cash-counters']).toBe('sales.create');
    expect(routePermission['/membership']).toBe('customers.view');
  });

  it('keeps cashier navigation in their dashboard, POS, sales, CRM, loyalty and HR self-service', () => {
    for (const path of ['/dashboard', '/pos', '/cash-counters', '/sales', '/parties', '/membership', '/hrm']) {
      expect(shouldRedirectBillingStaff(path)).toBe(false);
    }
    expect(shouldRedirectBillingStaff('/purchases')).toBe(true);
    expect(shouldRedirectBillingStaff('/inventory')).toBe(true);
  });
});
