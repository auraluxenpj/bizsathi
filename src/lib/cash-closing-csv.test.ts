import { describe, expect, it } from 'vitest';
import { buildCashClosingCsv } from './cash-closing-csv';

const row = {
  date: '2026-11-15', branch: 'Main, Nepalgunj', status: 'Closed', openedBy: 'Asha', closedBy: 'Bina',
  opening: '1000.00', receipts: '2500.00', refunds: '100.00', cashIn: '50.00', cashOut: '25.00',
  expected: '3425.00', actual: '3400.00', difference: '-25.00',
};

describe('cash closing CSV', () => {
  it('exports the supplied filtered rows with quoted columns and NPR values', () => {
    const csv = buildCashClosingCsv([row]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv).toContain('"Branch"');
    expect(csv).toContain('"Main, Nepalgunj"');
    expect(csv).toContain('"3425.00"');
    expect(csv).toContain('"-25.00"');
    expect(csv.trimEnd().split('\r\n')).toHaveLength(2);
  });

  it('escapes quotes and neutralizes spreadsheet formulas in text fields', () => {
    const csv = buildCashClosingCsv([{ ...row, branch: '=HYPERLINK("https://bad.example")' }]);
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain('""https://bad.example""');
  });

  it('returns a header-only export when no rows are supplied', () => {
    const csv = buildCashClosingCsv([]);
    expect(csv).toContain('"Date"');
    expect(csv.split('\r\n')).toHaveLength(2);
  });
});
