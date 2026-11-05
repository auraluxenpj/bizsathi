import Decimal from 'decimal.js';

const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

export function addVat(amount: number, rate = 13) {
  const base = new Decimal(amount); const vat = base.mul(rate).div(100);
  return { base: r2(base), vat: r2(vat), total: r2(base.plus(vat)) };
}
export function removeVat(total: number, rate = 13) {
  const t = new Decimal(total); const base = t.div(new Decimal(1).plus(new Decimal(rate).div(100)));
  return { base: r2(base), vat: r2(t.minus(base)), total: r2(t) };
}
export function discountPrice(price: number, percent: number) {
  const p = new Decimal(price); const off = p.mul(percent).div(100);
  return { discount: r2(off), final: r2(p.minus(off)) };
}
export function margin(cost: number, sell: number) {
  const c = new Decimal(cost); const s = new Decimal(sell); const profit = s.minus(c);
  return { profit: r2(profit), marginPct: s.isZero() ? 0 : r2(profit.div(s).mul(100)), markupPct: c.isZero() ? 0 : r2(profit.div(c).mul(100)) };
}
