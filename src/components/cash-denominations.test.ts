import { describe, expect, it } from 'vitest';
import { NPR_DENOMINATIONS, countedTotal, hasAnyCount, sanitizeCount } from './cash-denominations';

describe('cash denominations', () => {
  it('lists denominations largest first', () => {
    expect([...NPR_DENOMINATIONS]).toEqual([...NPR_DENOMINATIONS].sort((a, b) => b - a));
  });

  it('totals counts by denomination', () => {
    expect(countedTotal({ 1000: '2', 500: '1', 100: '3', 5: '4', 1: '7' })).toBe(2827);
  });

  it('treats empty, missing and invalid boxes as zero', () => {
    expect(countedTotal({})).toBe(0);
    expect(countedTotal({ 1000: '', 500: 'abc' })).toBe(0);
  });

  it('sanitizes typed counts', () => {
    expect(sanitizeCount('12a')).toBe('12');
    expect(sanitizeCount('007')).toBe('7');
    expect(sanitizeCount('0')).toBe('0');
    expect(sanitizeCount('-5')).toBe('5');
    expect(sanitizeCount('1234567')).toBe('123456');
  });

  it('detects whether anything was counted', () => {
    expect(hasAnyCount({})).toBe(false);
    expect(hasAnyCount({ 100: '' })).toBe(false);
    expect(hasAnyCount({ 100: '0' })).toBe(true);
  });
});
