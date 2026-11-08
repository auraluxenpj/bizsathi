import Decimal from 'decimal.js';
import { bsToAd } from './format';
import { voucherAccounts, voucherInput, type VoucherRequest } from './voucher-schemas';

export const receiptTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' } as const;
export type ReceiptType = keyof typeof receiptTypes;
export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
export const receiptCategories = voucherAccounts.filter(([id]) => id.startsWith('expense_')).map(([id, label]) => ({ id, label }));
export const paymentMethods = [{ id: 'bank', label: 'Bank' }, { id: 'wallet', label: 'Digital wallet' }] as const;
const categoryIds: readonly string[] = receiptCategories.map(c => c.id);

export function checkReceiptFile(file: { type: string; size: number }): string | null {
  if (!(file.type in receiptTypes)) return 'Only JPG, PNG or PDF files can be scanned.';
  if (file.size < 1) return 'That file is empty.';
  if (file.size > MAX_RECEIPT_BYTES) return 'Files must be 8 MB or smaller.';
  return null;
}
/** Always inside the business's own folder, which is what the storage rules require. */
export const receiptPath = (businessId: string, mime: ReceiptType, id: string = crypto.randomUUID()) => `${businessId}/${id}.${receiptTypes[mime]}`;

export type Extraction = { supplier: string | null; invoiceNumber: string | null; date: string | null; total: string | null; vat: string | null; category: string | null; categoryReason: string | null };
export const emptyExtraction: Extraction = { supplier: null, invoiceNumber: null, date: null, total: null, vat: null, category: null, categoryReason: null };

export function normalizeMoney(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  // Only currency words/symbols, commas and spaces are ignored; anything else (letters, signs, exponents) is rejected.
  const cleaned = String(value).replace(/(?:nrs?|npr|rs|रू|₹|\$)\.?/gi, '').replace(/[,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const amount = new Decimal(cleaned).toDecimalPlaces(2);
  return amount.gt(0) && amount.lt('10000000000000000') ? amount.toFixed(2) : null;
}
/** Accepts a normal date, or a Bikram Sambat date (year 2060 or later) which is converted. */
export function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const iso = m[0];
  if (Number(m[1]) >= 2060) return bsToAd(iso);
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Turns whatever the AI returned into safe, validated suggestions. Nothing here is trusted until a person confirms it. */
export function normalizeExtraction(raw: unknown): Extraction {
  if (!raw || typeof raw !== 'object') return { ...emptyExtraction };
  const r = raw as Record<string, unknown>;
  const category = typeof r['category'] === 'string' && categoryIds.includes(r['category']) ? r['category'] : null;
  return { supplier: text(r['supplier'], 160), invoiceNumber: text(r['invoiceNumber'], 80), date: normalizeDate(r['date']), total: normalizeMoney(r['total']), vat: normalizeMoney(r['vat']), category, categoryReason: category ? text(r['categoryReason'], 200) : null };
}
export const hasAnyDetail = (e: Extraction) => Object.values(e).some(v => v !== null);

export const receiptCode = (receiptId: string) => receiptId.replace(/-/g, '').slice(0, 6).toUpperCase();
/** The invoice number a posted reference was built from. */
export const invoiceFromReference = (reference: string) => reference.replace(/-[0-9A-F]{6}$/, '').trim().toLowerCase();

export type ReviewFields = { id: string; businessId: string; branchId: string; periodId: string; date: string; supplier: string; invoiceNumber: string; amount: string; category: string; method: 'bank' | 'wallet'; note: string; receiptId: string };
/** The same expense entry the Expense screen posts: debit the category, credit bank or wallet. */
export function buildExpenseRequest(f: ReviewFields): VoucherRequest {
  // The books require a unique reference per business, and invoice numbers repeat across suppliers, so a short receipt code is appended.
  const reference = `${f.invoiceNumber.trim().slice(0, 150) || 'RECEIPT'}-${receiptCode(f.receiptId)}`;
  const reason = [f.supplier.trim(), f.note.trim()].filter(Boolean).join(' – ') || 'Scanned receipt';
  return voucherInput.parse({ kind: 'expense', id: f.id, businessId: f.businessId, branchId: f.branchId, periodId: f.periodId, date: f.date, reference: reference.slice(0, 200), reason: reason.slice(0, 2000), lines: [{ account: f.category, debit: f.amount, credit: '0' }, { account: f.method, debit: '0', credit: f.amount }] });
}

/** Warns when an already posted receipt has the same invoice number and amount. */
export function findDuplicate(invoiceNumber: string, amount: string, posted: { reviewed: unknown }[]): boolean {
  const ref = invoiceNumber.trim().toLowerCase(); if (!ref || !normalizeMoney(amount)) return false;
  return posted.some(p => {
    const r = p.reviewed as { reference?: string; lines?: { debit?: string }[] } | null;
    const paid = r?.lines?.find(l => Number(l.debit) > 0)?.debit;
    return !!r && typeof r.reference === 'string' && invoiceFromReference(r.reference) === ref && !!paid && new Decimal(paid).eq(normalizeMoney(amount)!);
  });
}
