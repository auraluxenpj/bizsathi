import { Boxes, Receipt, RotateCcw, Warehouse, Landmark, BarChart3, Settings, LayoutDashboard, Package, FolderTree, Tag, Truck, Users, ScanBarcode, ShoppingCart, ClipboardList, Clock, SlidersHorizontal, ClipboardCheck, ShieldAlert, BookOpen, Wallet, Banknote, Building2, Calculator, TrendingUp, FileText, ListFilter, UserCog, ShieldCheck, type LucideIcon } from 'lucide-react';
import { validateReportSearch } from './report-filters';

export type WorkspaceItem = { name: string; to?: string; icon: LucideIcon; search?: Record<string, string>; unavailable?: boolean; note?: string };
export type WorkspaceGroup = { name: string; icon: LucideIcon; items: WorkspaceItem[] };
const report = (name: string, view: string, icon: LucideIcon, focus?: string): WorkspaceItem => ({ name, to: '/accounting', icon, search: { view, ...(focus ? { focus } : {}) } });
export const dashboardItem: WorkspaceItem = { name: 'Dashboard', to: '/dashboard', icon: LayoutDashboard };
export const workspaceGroups: WorkspaceGroup[] = [
 { name: 'Items & Masters', icon: Boxes, items: [
  { name: 'Products', to: '/products', icon: Package }, { name: 'Categories', to: '/categories', icon: FolderTree },
  { name: 'Brands', icon: Tag, unavailable: true }, { name: 'Suppliers', to: '/contacts', search: { kind: 'supplier' }, icon: Truck },
  { name: 'Customers', to: '/contacts', search: { kind: 'customer' }, icon: Users }, { name: 'Barcode Studio', to: '/products', search: { tool: 'barcode' }, icon: ScanBarcode },
 ] },
 { name: 'Invoices', icon: Receipt, items: [
  { name: 'Barcode POS', to: '/pos', icon: ScanBarcode }, { name: 'Sale Invoices', to: '/sales', icon: Receipt },
  { name: 'Purchase Invoices', to: '/purchases', icon: ShoppingCart }, { name: 'Purchase Orders', to: '/purchase-orders', icon: ClipboardList },
 ] },
 { name: 'Returns', icon: RotateCcw, items: [
  { name: 'Sale Returns', to: '/sales', search: { kind: 'sale_return' }, icon: RotateCcw }, { name: 'Purchase Returns', to: '/purchases', search: { kind: 'purchase_return' }, icon: RotateCcw },
 ] },
 { name: 'Stock & Inventory', icon: Warehouse, items: [
  { name: 'Batch & Expiry', icon: Clock, unavailable: true }, { name: 'Stock Adjustments', to: '/inventory', search: { tool: 'adjust' }, icon: SlidersHorizontal },
  { name: 'Stocktake Sessions', icon: ClipboardCheck, unavailable: true }, { name: 'Quarantine & Disposal', to: '/inventory', search: { tool: 'dispose' }, icon: ShieldAlert, note: 'Disposal available; quarantine not available' },
 ] },
 { name: 'Finance & Ledgers', icon: Landmark, items: [
  report('Customer Ledger', 'customer', Users), report('Supplier Ledger', 'supplier', Truck), report('Payment Vouchers', 'ledger', FileText, 'vouchers'),
  { name: 'Cash Drawer', to: '/cash-counters', icon: Banknote }, { name: 'Financial Accounts', to: '/cash-bank', icon: Building2 },
  { name: 'Operating Expenses', to: '/expenses', icon: Wallet }, report('Double-Entry & GL', 'ledger', Calculator),
 ] },
 { name: 'Reports', icon: BarChart3, items: [
  report('Net Profit P&L', 'profit', TrendingUp), report('Cost of Sale', 'sales', Calculator, 'cost'), report('Sale Detail', 'sales', Receipt),
  report('Purchase Detail', 'purchases', ShoppingCart), report('Current Stock', 'valuation', Boxes), report('Low Stock & Reorder', 'lowstock', ListFilter), report('Stock Adjustment', 'stock', SlidersHorizontal),
 ] },
 { name: 'System & Settings', icon: Settings, items: [
  { name: 'Settings', to: '/sales', search: { panel: 'settings' }, icon: Settings },
  { name: 'Users', to: '/businesses', search: { panel: 'users' }, icon: UserCog }, { name: 'Roles', to: '/businesses', search: { panel: 'roles' }, icon: ShieldCheck },
 ] },
];
const selectors = ['view', 'focus', 'kind', 'tool', 'panel'];
export function workspaceItemActive(item: WorkspaceItem, pathname: string, search: Record<string, unknown>) {
 if (!item.to || item.to !== pathname) return false;
 return selectors.every(key => (item.search?.[key] ?? '') === (search[key] ?? (key === 'view' && pathname === '/accounting' ? 'accounts' : '')));
}
export function workspaceItemSearch(item: WorkspaceItem, pathname: string, current: Record<string, unknown>) {
 const retained = ['/accounting', '/reports', '/transactions'].includes(pathname) && ['/accounting', '/reports', '/transactions'].includes(item.to ?? '') ? validateReportSearch(current) : {};
 return { ...retained, focus: undefined, ...item.search };
}