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

  it('preserves command metadata for permitted create actions', () => {
    const create = [{ label: 'New sale', to: '/sales', search: { new: '1' as const } }];
    expect(filterCommandEntries(create, () => true)).toEqual(create);
  });
});
