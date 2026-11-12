import Decimal from 'decimal.js';

export type DashboardDocument = {
  kind: string;
  status: string;
  total: number | string;
  branch_id: string;
  document_date: string;
};
export type DashboardJournal = {
  account_code: string;
  debit: number | string;
  credit: number | string;
  branch_id: string;
  entry_date: string;
};
export type DashboardEvidence = { documents: DashboardDocument[]; journals: DashboardJournal[] };
export type DashboardRange = { from: string; to: string };

const decimal = (n: number | string) => new Decimal(n || 0);

function inBranch<T extends { branch_id: string }>(rows: T[], branchId?: string) {
  return rows.filter(row => !branchId || row.branch_id === branchId);
}

function salesIn(documents: DashboardDocument[], from: string, to: string) {
  return documents.filter(doc => doc.status === 'confirmed' && doc.document_date >= from && doc.document_date <= to)
    .reduce((sum, doc) => sum.plus(doc.kind === 'sale' ? decimal(doc.total) : doc.kind === 'sale_return' ? decimal(doc.total).negated() : 0), new Decimal(0)).toNumber();
}

function expensesIn(journals: DashboardJournal[], from: string, to: string) {
  return journals.filter(row => row.account_code.startsWith('expense') && row.entry_date >= from && row.entry_date <= to)
    .reduce((sum, row) => sum.plus(decimal(row.debit)).minus(decimal(row.credit)), new Decimal(0)).toNumber();
}

function accountBalance(journals: DashboardJournal[], code: string) {
  return journals.filter(row => row.account_code === code)
    .reduce((sum, row) => sum.plus(decimal(row.debit)).minus(decimal(row.credit)), new Decimal(0)).toNumber();
}

/** Dashboard figures are read-only summaries of existing confirmed documents and posted journals. */
export function dashboardFigures(data: DashboardEvidence, branchId: string | undefined, today: string, month: DashboardRange) {
  const documents = inBranch(data.documents, branchId);
  const journals = inBranch(data.journals, branchId);
  const confirmed = documents.filter(doc => doc.status === 'confirmed');
  const posted = journals.filter(row => row.entry_date <= today);
  return {
    dailySales: salesIn(documents, today, today),
    monthlySales: salesIn(documents, month.from, month.to),
    dailyExpenses: expensesIn(journals, today, today),
    monthlyExpenses: expensesIn(journals, month.from, month.to),
    // These are point-in-time account balances; do not make them appear to vary by the sales period toggle.
    cash: accountBalance(posted, 'cash'),
    bank: accountBalance(posted, 'bank'),
    customerOutstanding: accountBalance(posted, 'receivable'),
    supplierOutstanding: -accountBalance(posted, 'payable'),
    confirmedDocumentCount: confirmed.length,
  };
}

const SELECTED_BUSINESS_KEY = 'bizsathi-selected-business';
export function selectedBusinessId(rows: { id: string }[], requested?: string | null) {
  return rows.some(row => row.id === requested) ? requested! : rows[0]?.id ?? '';
}
export function getSelectedBusinessId() {
  if (typeof window === 'undefined') return '';
  try { return window.localStorage.getItem(SELECTED_BUSINESS_KEY) ?? ''; } catch { return ''; }
}
export function setSelectedBusinessId(id: string) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(SELECTED_BUSINESS_KEY, id); } catch { /* storage may be disabled */ }
}

export function financialAvailability() {
  return { sales: null, purchases: null, cash: null, bank: null, receivables: null, payables: null, grossProfit: null, inventoryValue: null };
}
export function authorizedSelection<T extends { id: string }>(rows: T[], requested: string): string {
  return selectedBusinessId(rows, requested);
}
