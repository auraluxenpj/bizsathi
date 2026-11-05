import { describe, expect, it } from 'vitest';
import { adToBs, bsToAd, formatBsAd, formatNPR } from './format';

describe('formatNPR', () => {
  it('uses lakh/crore grouping with two decimals', () => {
    expect(formatNPR(123456)).toBe('रू 1,23,456.00');
    expect(formatNPR('12345678.5')).toBe('रू 1,23,45,678.50');
    expect(formatNPR(0)).toBe('रू 0.00');
  });
  it('keeps the sign and shows a dash for missing values', () => {
    expect(formatNPR(-1500)).toBe('-रू 1,500.00');
    expect(formatNPR(null)).toBe('—');
    expect(formatNPR(undefined)).toBe('—');
    expect(formatNPR(Number.NaN)).toBe('—');
  });
});

describe('BS/AD dates', () => {
  it('converts AD to BS and back', () => {
    expect(adToBs('2026-11-04')).toBe('2083-07-18');
    expect(bsToAd('2083-07-18')).toBe('2026-11-04');
    expect(formatBsAd('2026-11-04')).toBe('2083-07-18 BS · 2026-11-04 AD');
  });
  it('rejects invalid input', () => {
    expect(adToBs('2026-13-45')).toBeNull();
    expect(adToBs('nope')).toBeNull();
    expect(bsToAd('2083-07-45')).toBeNull();
    expect(bsToAd('abc')).toBeNull();
  });
});
