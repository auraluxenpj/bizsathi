/**
 * Role-based dashboards.
 *
 * Presentation only: the database and the permission checklist still decide what a member can read or post.
 * This module only chooses which dashboard a member lands on and computes the small figures those desks show.
 */
export type DashboardKind = 'business' | 'cashier' | 'stock' | 'entry';

/**
 * Owners, administrators and the finance/management roles share the business overview.
 * The three staff job titles each get a focused desk. Unknown or missing values fall back to the business
 * overview, whose statistics are separately hidden when the member lacks `reports.home_stats`.
 */
import { isBillingStaff } from './workspace-navigation';

/** Dashboard selection is presentation only; all data and actions remain permission-checked. */
export function dashboardKind(can: (permission: string) => boolean): DashboardKind {
  if (isBillingStaff(can)) return 'cashier';
  if (can('accounts.view') || can('reports.home_stats') || can('reports.view') || can('settings.edit') || can('staff.view') || can('hr.employees.view')) return 'business';
  if (can('stock.edit') || can('inventory.edit')) return 'stock';
  if (can('purchases.create') || can('sales.create')) return 'entry';
  return 'business';
}

/** Amounts are summed in paisa so two-decimal totals never drift. */
const paisa = (amount: number) => Math.round(amount * 100);

export type DayDocument = { kind: string; status: string; total: number; document_date: string };

/** Confirmed sales on one day, net of returns, with the number of bills and returns behind it. */
export function saleDayTotals(documents: readonly DayDocument[], date: string): { bills: number; returns: number; net: number } {
  let bills = 0;
  let returns = 0;
  let net = 0;
  for (const document of documents) {
    if (document.status !== 'confirmed' || document.document_date !== date) continue;
    if (document.kind === 'sale') { bills += 1; net += paisa(document.total); }
    else if (document.kind === 'sale_return') { returns += 1; net -= paisa(document.total); }
  }
  return { bills, returns, net: net / 100 };
}

export type EntryDocument = DayDocument & { actor_id: string | null };

/** How many confirmed sales and purchases this member entered on one day. */
export function entryDayCounts(documents: readonly EntryDocument[], userId: string, date: string): { sales: number; purchases: number } {
  let sales = 0;
  let purchases = 0;
  for (const document of documents) {
    if (document.actor_id !== userId || document.status !== 'confirmed' || document.document_date !== date) continue;
    if (document.kind === 'sale') sales += 1;
    else if (document.kind === 'purchase') purchases += 1;
  }
  return { sales, purchases };
}

export type CounterEvent = { kind: string; session_id: string; actor_id: string | null };

/** The member's own cash drawer session that was opened and not yet closed (same rule as the Cash Counters screen). */
export function openDrawer<T extends CounterEvent>(events: readonly T[], userId: string): T | undefined {
  return events.find(event => event.kind === 'open' && event.actor_id === userId && !events.some(other => other.session_id === event.session_id && other.kind === 'close'));
}

/** Calendar day (YYYY-MM-DD) of a timestamp in the browser's own time zone, matching `todayAd()`. Empty when invalid. */
export function localDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function countOnDay(rows: readonly { created_at: string }[], day: string): number {
  return rows.reduce((count, row) => count + (localDay(row.created_at) === day ? 1 : 0), 0);
}

/** Keep only the shortcuts whose page the member may open and whose own permission (if any) is allowed. */
export function allowedActions<T extends { to: string; permission?: string | undefined }>(actions: readonly T[], routeVisible: (to: string) => boolean, can: (permission: string) => boolean): T[] {
  return actions.filter(action => routeVisible(action.to) && (!action.permission || can(action.permission)));
}
