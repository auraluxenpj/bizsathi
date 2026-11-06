import Papa from 'papaparse';
import { partyInput } from './inventory-schemas';

// Accepts BizSathi's own export and common spreadsheet exports (e.g. Karobar party lists saved as CSV).
const aliases: Record<'name' | 'phone' | 'email' | 'address' | 'pan_vat_number', string[]> = {
  name: ['name', 'party name', 'party', 'customer name', 'supplier name'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'contact number'],
  email: ['email', 'email address'],
  address: ['address', 'billing address'],
  pan_vat_number: ['pan_vat_number', 'pan', 'vat', 'pan/vat', 'pan/vat number', 'pan number', 'vat number'],
};
export type ImportedParty = { name: string; phone: string; email: string; address: string; pan_vat_number: string };

export const partyKey = (p: { name: string; phone: string }) => `${p.name.trim().toLowerCase()}|${p.phone.replace(/\D/g, '')}`;

export function parsePartyCsv(text: string, businessId: string, kind: 'customer' | 'supplier'): { rows: ImportedParty[]; blank: number; repeated: number } {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim().toLowerCase() });
  // A single-column file (just names) has no delimiter to detect; that is fine.
  const firstError = parsed.errors.find(e => e.code !== 'UndetectableDelimiter');
  if (firstError) throw new Error(`CSV row ${(firstError.row ?? 0) + 2}: ${firstError.message}`);
  const fields = parsed.meta.fields ?? [];
  if (!aliases.name.some(a => fields.includes(a))) throw new Error('CSV needs a "name" (or "party name") column.');
  const pick = (row: Record<string, string>, key: keyof typeof aliases) => {
    const col = aliases[key].find(a => fields.includes(a));
    return (col ? row[col] ?? '' : '').trim();
  };
  const seen = new Set<string>(); const rows: ImportedParty[] = []; let blank = 0; let repeated = 0;
  parsed.data.forEach((row, index) => {
    const name = pick(row, 'name');
    if (!name) { blank++; return; }
    const candidate = { name, phone: pick(row, 'phone'), email: pick(row, 'email'), address: pick(row, 'address'), pan_vat_number: pick(row, 'pan_vat_number') };
    const checked = partyInput.safeParse({ ...candidate, businessId, kind });
    if (!checked.success) throw new Error(`CSV row ${index + 2}: ${checked.error.issues[0]?.message ?? 'invalid value'}.`);
    const key = partyKey(candidate);
    if (seen.has(key)) { repeated++; return; }
    seen.add(key); rows.push(candidate);
  });
  return { rows, blank, repeated };
}
