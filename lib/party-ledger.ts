import Decimal from 'decimal.js';

// Read-only maths over records that already exist. Posting still goes through the existing
// post_commerce_payment function; nothing here writes to the database.

export type LedgerDoc = { id: string; kind: string; status: string; total: number | string; document_date: string; created_at: string; party_id: string | null; source_id: string | null; reference: string; branch_id: string };
export type LedgerPayment = { id: string; document_id: string; amount: number | string; direction: string; payment_date: string; created_at: string; method: string; reference: string };
export type LedgerEntry = { date: string; label: string; reference: string; amount: number; balance: number; documentId: string };

// Positive balance = the party owes you (To Receive). Negative = you owe them (To Give).
const docSign: Record<string, 1 | -1> = { sale: 1, sale_return: -1, purchase: -1, purchase_return: 1 };
const docLabel: Record<string, string> = { sale: 'Sale', sale_return: 'Sale return', purchase: 'Purchase', purchase_return: 'Purchase return' };
const byTime = (a: { date: string; created: string }, b: { date: string; created: string }) => (a.date + a.created).localeCompare(b.date + b.created);

export function ledgerEntries(partyId: string, docs: LedgerDoc[], payments: LedgerPayment[]): LedgerEntry[] {
  const mine = docs.filter(d => d.party_id === partyId && d.status === 'confirmed' && d.kind in docSign);
  const ids = new Set(mine.map(d => d.id));
  const raw = [
    ...mine.map(d => ({ date: d.document_date, created: d.created_at, label: docLabel[d.kind] ?? d.kind, reference: d.reference, documentId: d.id, signed: new Decimal(d.total).mul(docSign[d.kind] ?? 1) })),
    ...payments.filter(p => ids.has(p.document_id)).map(p => ({ date: p.payment_date, created: p.created_at, label: p.direction === 'in' ? 'Payment received' : 'Payment given', reference: p.reference, documentId: p.document_id, signed: new Decimal(p.amount).mul(p.direction === 'in' ? -1 : 1) })),
  ].sort(byTime);
  let running = new Decimal(0);
  return raw.map(r => { running = running.plus(r.signed); return { date: r.date, label: r.label, reference: r.reference, documentId: r.documentId, amount: r.signed.toNumber(), balance: running.toNumber() }; });
}

export function partyBalance(partyId: string, docs: LedgerDoc[], payments: LedgerPayment[]): number {
  const e = ledgerEntries(partyId, docs, payments);
  return e.length ? e[e.length - 1]!.balance : 0;
}

export function allBalances(docs: LedgerDoc[], payments: LedgerPayment[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of new Set(docs.flatMap(d => (d.party_id ? [d.party_id] : [])))) out.set(id, partyBalance(id, docs, payments));
  return out;
}

export type Outstanding = { doc: LedgerDoc; outstanding: number };

/** Unpaid invoices for a party, oldest first. Same formula the database uses: total - returns - payments. */
export function outstandingInvoices(partyId: string, kind: 'sale' | 'purchase', docs: LedgerDoc[], payments: LedgerPayment[]): Outstanding[] {
  const returnKind = kind === 'sale' ? 'sale_return' : 'purchase_return';
  return docs
    .filter(d => d.party_id === partyId && d.kind === kind && d.status === 'confirmed')
    .map(doc => {
      const returned = docs.filter(r => r.source_id === doc.id && r.kind === returnKind && r.status === 'confirmed').reduce((s, r) => s.plus(r.total), new Decimal(0));
      const paid = payments.filter(p => p.document_id === doc.id).reduce((s, p) => s.plus(p.amount), new Decimal(0));
      return { doc, outstanding: Decimal.max(0, new Decimal(doc.total).minus(returned).minus(paid)).toNumber() };
    })
    .filter(o => o.outstanding > 0)
    .sort((a, b) => (a.doc.document_date + a.doc.created_at).localeCompare(b.doc.document_date + b.doc.created_at));
}

export const totalOutstanding = (rows: Outstanding[]) => rows.reduce((s, r) => s.plus(r.outstanding), new Decimal(0)).toNumber();

/** Spread a payment over invoices, oldest first. Throws if it would exceed what is owed. */
export function allocatePayment(rows: Outstanding[], amount: number): { documentId: string; branchId: string; reference: string; amount: number }[] {
  let left = new Decimal(amount);
  if (!left.gt(0) || left.decimalPlaces() > 2) throw new Error('Enter an amount with at most two decimal places.');
  if (left.gt(totalOutstanding(rows))) throw new Error('Amount is more than the outstanding balance.');
  const out: { documentId: string; branchId: string; reference: string; amount: number }[] = [];
  for (const r of rows) {
    if (left.lte(0)) break;
    const part = Decimal.min(left, r.outstanding);
    out.push({ documentId: r.doc.id, branchId: r.doc.branch_id, reference: r.doc.reference, amount: part.toNumber() });
    left = left.minus(part);
  }
  return out;
}
