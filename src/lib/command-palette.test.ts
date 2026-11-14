import { describe, expect, it } from 'vitest';
import { filterCommandEntries, type CommandEntry } from './command-palette';

describe('filterCommandEntries', () => {
  const entries: CommandEntry[] = [
    { label: 'Sales', to: '/sales' },
    { label: 'Manage staff', to: '/businesses' },
    { label: 'Reports', to: '/accounting' },
  ];

  it('shows only destinations allowed by the supplied page-visibility rule', () => {
    expect(filterCommandEntries(entries, to => to !== '/businesses')).toEqual([
      { label: 'Sales', to: '/sales' },
      { label: 'Reports', to: '/accounting' },
    ]);
  });

  it('returns no commands when the user has no visible destinations', () => {
    expect(filterCommandEntries(entries, () => false)).toEqual([]);
  });

  it('hides create actions when the matching create permission is denied', () => {
    const create: CommandEntry[] = [
      { label: 'New sale', to: '/sales', search: { new: '1' }, permission: 'sales.create' },
      { label: 'New purchase', to: '/purchases', search: { new: '1' }, permission: 'purchases.create' },
    ];
    expect(filterCommandEntries(create, () => true, permission => permission !== 'sales.create')).toEqual([
      { label: 'New purchase', to: '/purchases', search: { new: '1' }, permission: 'purchases.create' },
    ]);
  });

  it('shows Add party when either customer or supplier creation is allowed', () => {
    const addParty: CommandEntry[] = [{ label: 'Add party', to: '/contacts', anyPermission: ['customers.create', 'suppliers.create'] }];
    expect(filterCommandEntries(addParty, () => true, permission => permission === 'suppliers.create')).toEqual(addParty);
    expect(filterCommandEntries(addParty, () => true, () => false)).toEqual([]);
  });

  it('preserves commands when both route and action permissions are allowed', () => {
    const create: CommandEntry[] = [{ label: 'New sale', to: '/sales', search: { new: '1' }, permission: 'sales.create' }];
    expect(filterCommandEntries(create, () => true, () => true)).toEqual(create);
  });
});
