import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  POINTS_PER_NPR,
  pointsToNpr,
  maxRedeemablePoints,
  allocateLoyaltyDiscount,
  applyRedemption,
  restoredPointsTotal,
  eligibleValue,
} from "./loyalty-redemption";
import { cartTotal, storedDocumentInput } from "./commerce-schemas";
const id = "11111111-1111-4111-8111-111111111111";
const cart = [
  { variantId: id, quantity: 2, price: 500, discount: 0, taxRate: 13 },
  { variantId: id, quantity: 1, price: 250, discount: 50, taxRate: 13 },
];
describe("Points exchange rate", () => {
  it("is 100 points per NPR 1, so one point is NPR 0.01", () => {
    expect(POINTS_PER_NPR).toBe(100);
    expect(pointsToNpr(100)).toBe(1);
    expect(pointsToNpr(1)).toBe(0.01);
    expect(pointsToNpr(12345)).toBe(123.45);
  });
});
describe("Spending limits", () => {
  it("never exceeds the balance", () => expect(maxRedeemablePoints(500, cart)).toBe(500));
  it("never exceeds the eligible value, and leaves a paisa payable", () => {
    const e = eligibleValue(cart);
    expect(e).toBe(1200);
    expect(maxRedeemablePoints(10_000_000, cart)).toBe(119_999);
  });
  it("is zero for a zero or negative balance, and fractional balances round down", () => {
    expect(maxRedeemablePoints(0, cart)).toBe(0);
    expect(maxRedeemablePoints(-40, cart)).toBe(0);
    expect(maxRedeemablePoints(99.9, cart)).toBe(99);
  });
  it("is zero for an empty cart", () => expect(maxRedeemablePoints(1000, [])).toBe(0));
});
describe("Discount allocation", () => {
  it("always adds up to exactly the points, to the paisa", () => {
    for (const p of [1, 7, 100, 333, 9999, 119_999]) {
      const split = allocateLoyaltyDiscount(cart, p);
      expect(
        split
          .reduce((s, x) => s.plus(x), new Decimal(0))
          .mul(100)
          .toNumber(),
      ).toBe(p);
    }
  });
  it("never gives a line more than its own value", () => {
    const lines = [
      { quantity: 1, price: 1, discount: 0 },
      { quantity: 1, price: 1000, discount: 0 },
    ];
    const split = allocateLoyaltyDiscount(lines, 99_999);
    expect(split[0]!).toBeLessThanOrEqual(1);
    expect(split[1]!).toBeLessThanOrEqual(1000);
  });
  it("refuses more than the cart is worth", () =>
    expect(allocateLoyaltyDiscount([{ quantity: 1, price: 10 }], 1001)).toEqual([0]));
  it("lowers the payable total by exactly NPR points/100 before tax effects", () => {
    const lines = [{ variantId: id, quantity: 1, price: 1000, discount: 0, taxRate: 0 }];
    const after = applyRedemption(lines, 2500);
    expect(cartTotal(lines)).toBe(1000);
    expect(cartTotal(after)).toBe(975);
    expect((after[0] as { loyaltyDiscount?: number }).loyaltyDiscount).toBe(25);
  });
  it("keeps any manual discount alongside the loyalty discount", () => {
    const after = applyRedemption([{ quantity: 1, price: 1000, discount: 100 }], 500);
    expect(after[0]).toMatchObject({ discount: 105, loyaltyDiscount: 5 });
  });
  it("earning is based on the final discounted amount", () => {
    const after = applyRedemption(
      [{ variantId: id, quantity: 1, price: 1000, discount: 0, taxRate: 0 }],
      10_000,
    );
    expect(cartTotal(after)).toBe(900);
  });
});
describe("Returns restore points in proportion", () => {
  it("restores everything on a full return", () =>
    expect(restoredPointsTotal(1000, 900, 900)).toBe(1000));
  it("restores half for half the value, rounding down", () => {
    expect(restoredPointsTotal(1000, 900, 450)).toBe(500);
    expect(restoredPointsTotal(1001, 900, 450)).toBe(500);
  });
  it("never restores more than was spent, and nothing if nothing was spent", () => {
    expect(restoredPointsTotal(1000, 900, 5000)).toBe(1000);
    expect(restoredPointsTotal(0, 900, 450)).toBe(0);
  });
  it("is cumulative, so several partial returns add up to the full amount", () => {
    const a = restoredPointsTotal(1000, 900, 300),
      b = restoredPointsTotal(1000, 900, 900);
    expect(a).toBe(333);
    expect(b - a).toBe(667);
  });
});
describe("Request shape", () => {
  const base = {
    id,
    businessId: id,
    branchId: id,
    periodId: id,
    date: "2026-11-12",
    kind: "sale",
    status: "confirmed",
    reference: "S",
    mobile: "9841234567",
  };
  it("old requests parse unchanged, with no new keys added", () => {
    const r = storedDocumentInput.parse({
      ...base,
      lines: [{ variantId: id, quantity: 1, price: 10 }],
    });
    expect("redeemPoints" in r).toBe(false);
    expect("loyaltyDiscount" in r.lines[0]!).toBe(false);
  });
  it("keeps the redemption fields so the database can verify them", () => {
    const r = storedDocumentInput.parse({
      ...base,
      redeemPoints: 100,
      lines: [{ variantId: id, quantity: 1, price: 10, discount: 1, loyaltyDiscount: 1 }],
    });
    expect(r.redeemPoints).toBe(100);
    expect(r.lines[0]!.loyaltyDiscount).toBe(1);
  });
  it("rejects a loyalty discount larger than the line discount", () =>
    expect(
      storedDocumentInput.safeParse({
        ...base,
        lines: [{ variantId: id, quantity: 1, price: 10, discount: 1, loyaltyDiscount: 2 }],
      }).success,
    ).toBe(false));
});
