import { describe, expect, it } from 'vitest';
import { parsePartyCsv, partyKey } from './party-csv';

const biz = '55555555-5555-4555-8555-555555555555';
describe('parsePartyCsv', () => {
  it('reads BizSathi and Karobar-style headers', () => {
    const r = parsePartyCsv('Party Name,Mobile Number,Address\nRam Traders,98000 00000,Kanpur\nSita,,', biz, 'customer');
    expect(r.rows).toEqual([{ name: 'Ram Traders', phone: '98000 00000', email: '', address: 'Kanpur', pan_vat_number: '' }, { name: 'Sita', phone: '', email: '', address: '', pan_vat_number: '' }]);
  });
  it('skips blank names and repeats inside the file', () => {
    const r = parsePartyCsv('name,phone\nA,1\n,2\nA,1\nB,3', biz, 'supplier');
    expect(r.rows.map(x => x.name)).toEqual(['A', 'B']);
    expect([r.blank, r.repeated]).toEqual([1, 1]);
  });
  it('rejects a file without a name column and bad emails', () => {
    expect(() => parsePartyCsv('phone\n1', biz, 'customer')).toThrow(/name/);
    expect(() => parsePartyCsv('name,email\nA,not-an-email', biz, 'customer')).toThrow(/row 2/);
  });
  it('matches existing parties by name and phone digits', () => {
    expect(partyKey({ name: ' Ram ', phone: '98-00' })).toBe(partyKey({ name: 'ram', phone: '9800' }));
  });
});
