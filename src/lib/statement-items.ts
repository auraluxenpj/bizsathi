export type StatementItem = { name: string; quantity: number; price: number };
type Variant = { id: string; name: string; products?: { name?: string } | null };

/** Item names shown under an invoice in a party statement; read from the invoice's saved lines. */
export function statementItems(lines: unknown, variants: readonly Variant[]): StatementItem[] {
  if (!Array.isArray(lines)) return [];
  const byId = new Map(variants.map(v => [v.id, v]));
  return lines.flatMap(l => {
    if (!l || typeof l !== 'object') return [];
    const r = l as { variantId?: unknown; quantity?: unknown; price?: unknown };
    if (typeof r.variantId !== 'string') return [];
    const v = byId.get(r.variantId);
    const product = v?.products?.name ?? '';
    const name = v ? (v.name && v.name !== 'Standard' ? `${product} ${v.name}`.trim() : product || v.name) : 'Item';
    return [{ name, quantity: Number(r.quantity) || 0, price: Number(r.price) || 0 }];
  });
}
