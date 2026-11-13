// Retail / wholesale price levels for sales, plus the MRP reference price.
// Presentation and cart seeding only: posting RPCs keep reading each document line's price from the request,
// so choosing a level never creates a second pricing source for accounting.

export type PriceLevel = 'retail' | 'wholesale';

type Priced = { selling_price: number | string; wholesale_price?: number | string | null };

/** Price for a level. A missing or 0 wholesale price means "not set", so wholesale falls back to retail. */
export function levelPrice(variant: Priced, level: PriceLevel): number {
  const retail = Number(variant.selling_price) || 0;
  if (level !== 'wholesale') return retail;
  const wholesale = Number(variant.wholesale_price) || 0;
  return wholesale > 0 ? wholesale : retail;
}

/** Move a cart line to another level, but keep a price the cashier typed by hand. */
export function repriceLine(current: number, variant: Priced, from: PriceLevel, to: PriceLevel): number {
  return Math.abs(current - levelPrice(variant, from)) < 0.005 ? levelPrice(variant, to) : current;
}

/** Non-blocking hints for the product form; nothing here stops a save. */
export function priceWarnings(p: { selling_price: number; mrp: number; wholesale_price: number }): string[] {
  const out: string[] = [];
  if (p.mrp > 0 && p.selling_price > p.mrp) out.push('Selling price is above the MRP.');
  if (p.wholesale_price > 0 && p.selling_price > 0 && p.wholesale_price > p.selling_price) {
    out.push('Wholesale price is above the retail price.');
  }
  return out;
}
