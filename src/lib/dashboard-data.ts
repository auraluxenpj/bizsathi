// Financial sources do not exist yet. Absence is not an observed zero balance.
export function financialAvailability() {
 return { sales: null, purchases: null, cash: null, bank: null, receivables: null, payables: null, grossProfit: null, inventoryValue: null };
}
export function authorizedSelection<T extends { id: string }>(rows: T[], requested: string): string {
 return rows.some(row => row.id === requested) ? requested : rows[0]?.id ?? '';
}