import { describe, expect, it } from 'vitest';
import { comparePhysicalCount, parsePhysicalCountCsv } from './physical-count-reconciliation';

const variants = [{ id: 'v1', sku: 'SKU-1' }, { id: 'v2', sku: 'SKU-2' }];
const branches = [{ id: 'b1', name: 'Main' }, { id: 'b2', name: 'Outlet' }];
const balances = new Map<string, string | number>([['b1:v1', '5'], ['b2:v1', '2.5']]);

describe('physical count reconciliation', () => {
  it('parses a standard count sheet and compares exact quantities', () => {
    const rows = parsePhysicalCountCsv('SKU,Branch,Counted_Quantity\nSKU-1,Main,5\nSKU-1,Outlet,2.500');
    const result = comparePhysicalCount({ rows, variants, branches, systemBalances: balances });
    expect(result.isFullyMatched).toBe(true);
    expect(result.matchedRows).toBe(2);
  });
  it('reports physical differences without changing the system balance', () => {
    const rows = parsePhysicalCountCsv('SKU,Branch,Counted_Quantity\nSKU-1,Main,4');
    const result = comparePhysicalCount({ rows, variants, branches, systemBalances: balances });
    expect(result.differenceRows).toBe(1);
    expect(result.issues[0]?.difference).toBe('-1');
    expect(balances.get('b1:v1')).toBe('5');
  });
  it('rejects missing columns, invalid quantities and excess precision', () => {
    expect(() => parsePhysicalCountCsv('SKU,Quantity\nSKU-1,2')).toThrow('SKU, Branch and Counted_Quantity');
    expect(() => parsePhysicalCountCsv('SKU,Branch,Counted_Quantity\nSKU-1,Main,-1')).toThrow('non-negative');
    expect(() => parsePhysicalCountCsv('SKU,Branch,Counted_Quantity\nSKU-1,Main,1.0001')).toThrow('up to 3 decimals');
  });
  it('flags unknown SKUs, unknown branches and duplicate count rows', () => {
    const rows = parsePhysicalCountCsv('SKU,Branch,Counted_Quantity\nNOPE,Main,1\nSKU-1,Missing,1\nSKU-1,Main,5\nSKU-1,Main,5');
    const result = comparePhysicalCount({ rows, variants, branches, systemBalances: balances });
    expect(result.issues.map(i => i.code)).toEqual(expect.arrayContaining(['unknown_sku', 'unknown_branch', 'duplicate_count']));
    expect(result.isFullyMatched).toBe(false);
  });
});
