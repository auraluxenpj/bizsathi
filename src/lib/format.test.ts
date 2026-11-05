import { describe, expect, it } from 'vitest';
import { fiscalYearFor, adToBs, addDaysAd, bsMonthInfo, bsShort, bsToAd, compactNPR, formatBsAd, formatNPR } from './format';

describe('formatNPR', () => {
  it('uses lakh/crore grouping with two decimals', () => {
    expect(formatNPR(123456)).toBe('Rs. 1,23,456.00');
    expect(formatNPR('12345678.5')).toBe('Rs. 1,23,45,678.50');
    expect(formatNPR(0)).toBe('Rs. 0.00');
  });
  it('keeps the sign and shows a dash for missing values', () => {
    expect(formatNPR(-1500)).toBe('-Rs. 1,500.00');
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

describe('dashboard helpers', () => {
  it('finds the BS month range', () => {
    const m = bsMonthInfo('2026-11-05');
    expect(m?.name).toBe('Kartik');
    expect(m && m.fromAd <= '2026-11-05' && '2026-11-05' <= m.toAd).toBe(true);
    expect(bsShort('2026-11-04')).toBe('Kar 18');
  });
  it('formats compact amounts and adds days', () => {
    expect(compactNPR(20000)).toBe('20k');
    expect(compactNPR(250000)).toBe('2.5L');
    expect(compactNPR(500)).toBe('500');
    expect(addDaysAd('2026-11-05', -6)).toBe('2026-10-30');
  });
});

describe('fiscal year', () => {
  it('finds the Nepal fiscal year that contains a date', () => {
    const fy = fiscalYearFor('2026-11-05');
    expect(fy?.name).toBe('FY 2083/84');
    expect(fy && fy.start <= '2026-11-05' && '2026-11-05' <= fy.end).toBe(true);
    expect(adToBs(fy!.start)).toBe('2083-04-01');
    expect(fiscalYearFor('2026-03-01')?.name).toBe('FY 2082/83');
  });
});
