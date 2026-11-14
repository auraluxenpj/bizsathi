import Decimal from 'decimal.js';
import { addDaysAd } from './format';
type TrendEvidence = { documents: { kind: string; status: string; total: number; branch_id: string; document_date: string }[]; journals: { account_code: string; debit: number; credit: number; branch_id: string; entry_date: string }[] };
export function dashboardTrends(data: TrendEvidence, branch: string, from: string, to: string) {
 const result = [];
 for (let day = from; day <= to; day = addDaysAd(day, 1)) {
  const revenue = data.documents.filter(d => d.status === 'confirmed' && (!branch || d.branch_id === branch) && d.document_date === day).reduce((n, d) => n.plus(d.kind === 'sale' ? d.total : d.kind === 'sale_return' ? -d.total : 0), new Decimal(0));
  const expense = data.journals.filter(j => (!branch || j.branch_id === branch) && j.entry_date === day && j.account_code.startsWith('expense')).reduce((n, j) => n.plus(j.debit).minus(j.credit), new Decimal(0));
  result.push({ date: day, revenue: revenue.toNumber(), expense: expense.toNumber() });
 }
 return result;
}