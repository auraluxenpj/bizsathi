import Decimal from "decimal.js";

/** 100 loyalty points are worth NPR 1, so one point is NPR 0.01. Whole points only. */
export const POINTS_PER_NPR = 100;
const PAISA = new Decimal("0.01");

type Line = {
  quantity: number;
  price: number;
  discount?: number | undefined;
  loyaltyDiscount?: number | undefined;
};

export function pointsToNpr(points: number): number {
  return new Decimal(points).div(POINTS_PER_NPR).toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
}

/** What a line can still be discounted by, before tax and before any loyalty discount. */
function eligible(line: Line): Decimal {
  const value = new Decimal(line.quantity)
    .mul(line.price)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const manual = new Decimal(line.discount ?? 0).minus(line.loyaltyDiscount ?? 0);
  return Decimal.max(0, value.minus(manual));
}

export function eligibleValue(lines: Line[]): number {
  return lines.reduce((sum, l) => sum.plus(eligible(l)), new Decimal(0)).toNumber();
}

/**
 * The most points that can be spent on this cart: never more than the balance, never more than the eligible
 * value, and the sale must keep at least one paisa payable so a later return can restore points in proportion.
 */
export function maxRedeemablePoints(available: number, lines: Line[]): number {
  const room = new Decimal(eligibleValue(lines)).minus(PAISA);
  if (available <= 0 || room.lte(0)) return 0;
  return Math.max(0, Math.min(Math.floor(available), room.mul(POINTS_PER_NPR).floor().toNumber()));
}

/** Splits the discount across lines in proportion to their value, to the paisa, never above a line's own value. */
export function allocateLoyaltyDiscount(lines: Line[], points: number): number[] {
  const caps = lines.map((l) => eligible(l).mul(100).toNumber());
  const totalCap = caps.reduce((a, b) => a + b, 0);
  const cents = points; // 1 point is exactly 1 paisa
  if (!Number.isInteger(points) || points <= 0 || cents > totalCap) return lines.map(() => 0);
  const raw = caps.map((c) => (c * cents) / totalCap);
  const out = raw.map((r, i) => Math.min(Math.floor(r), caps[i]!));
  let left = cents - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let pass = 0; left > 0 && pass < lines.length + 1; pass++) {
    for (const { i } of order) {
      if (left > 0 && out[i]! < caps[i]!) {
        out[i]!++;
        left--;
      }
    }
  }
  return out.map((c) => new Decimal(c).div(100).toNumber());
}

/** Adds the loyalty discount to each line's discount and labels it, so the database can check the two agree. */
export function applyRedemption<T extends Line>(lines: T[], points: number): T[] {
  const split = allocateLoyaltyDiscount(lines, points);
  return lines.map(
    (l, i) =>
      (split[i]! > 0
        ? {
            ...l,
            discount: new Decimal(l.discount ?? 0).plus(split[i]!).toNumber(),
            loyaltyDiscount: split[i]!,
          }
        : { ...l, discount: l.discount ?? 0 }) as T,
  );
}

/** Total points that should be back with the customer after returns worth `returned` of a sale worth `saleTotal`. */
export function restoredPointsTotal(spent: number, saleTotal: number, returned: number): number {
  if (spent <= 0 || saleTotal <= 0) return 0;
  if (new Decimal(saleTotal).minus(returned).lte(0)) return spent;
  return Math.min(spent, new Decimal(spent).mul(returned).div(saleTotal).floor().toNumber());
}
