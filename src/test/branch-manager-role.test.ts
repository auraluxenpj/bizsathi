import { describe, expect, it } from 'vitest';
import { deniedForTitle, jobTitles } from '@/lib/job-titles';
import { deniedForRole, rolePresets } from '@/lib/permissions';

describe('Branch Manager role boundary', () => {
  it('is a distinct lower-ranked security role, not the Accountant title', () => {
    expect(jobTitles.branch_manager.base).toBe('branch_manager');
    expect(jobTitles.accountant.base).toBe('accountant');
    expect(rolePresets['branch_manager']?.label).toBe('Branch Manager');
  });

  it('keeps branch operations while denying business-wide finance and administration', () => {
    const denied = deniedForTitle('branch_manager');
    for (const permission of [
      'sales.delete',
      'purchases.delete',
      'purchases.view',
      'accounts.view',
      'accounts.create',
      'settings.edit',
      'settings.delete_business',
      'staff.edit',
      'other.purchase_price',
      'other.change_date',
    ]) {
      expect(denied).toContain(permission);
    }
    for (const permission of [
      'sales.view',
      'expenses.view',
      'inventory.view',
      'stock.create',
      'stock.edit',
      'reports.view',
      'reports.items',
      'reports.transactions',
    ]) {
      expect(denied).not.toContain(permission);
    }
  });

  it('keeps Admin authority separate and prevents business deletion', () => {
    expect(deniedForRole('admin')).toContain('settings.delete_business');
    expect(deniedForRole('admin')).not.toContain('settings.edit');
  });
});
