import { isBillingStaff } from './workspace-navigation';
export type DashboardKind = 'business' | 'cashier' | 'stock' | 'entry';
export function dashboardKind(can: (permission: string) => boolean): DashboardKind {
 if (isBillingStaff(can)) return 'cashier';
 if (can('accounts.view') || can('reports.home_stats') || can('reports.view') || can('settings.edit') || can('staff.view') || can('hr.employees.view')) return 'business';
 if (can('stock.edit') || can('inventory.edit')) return 'stock';
 if (can('purchases.create') || can('sales.create')) return 'entry';
 return 'business';
}
